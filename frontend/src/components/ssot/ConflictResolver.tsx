/**
 * Conflict Resolver Component
 * Interface for viewing and resolving data conflicts
 * T292 - Conflict resolution interface
 */

import React, { useState, useEffect, useCallback } from 'react';

interface DataConflict {
  id: string;
  organizationId: string;
  masterRecordId: string;
  sourceId: string;
  sourceName: string;
  conflictType: 'field_value' | 'record_existence' | 'relationship' | 'schema';
  status: 'pending' | 'resolved' | 'ignored' | 'escalated';
  field?: string;
  masterValue: unknown;
  sourceValue: unknown;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  resolutionNotes?: string;
}

interface ConflictStats {
  total: number;
  pending: number;
  resolved: number;
  ignored: number;
  escalated: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  avgResolutionTime: number;
}

interface ConflictResolverProps {
  organizationId: string;
  onConflictResolved?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f97316',
  resolved: '#22c55e',
  ignored: '#6b7280',
  escalated: '#ef4444',
};

const TYPE_LABELS: Record<string, string> = {
  field_value: 'Field Value',
  record_existence: 'Record Existence',
  relationship: 'Relationship',
  schema: 'Schema',
};

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  organizationId,
  onConflictResolved,
}) => {
  const [conflicts, setConflicts] = useState<DataConflict[]>([]);
  const [stats, setStats] = useState<ConflictStats | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<DataConflict | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{
    status?: string;
    sourceId?: string;
    conflictType?: string;
  }>({ status: 'pending' });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [mergedValue, setMergedValue] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const pageSize = 20;

  const fetchConflicts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });

      if (filter.status) params.append('status', filter.status);
      if (filter.sourceId) params.append('sourceId', filter.sourceId);
      if (filter.conflictType) params.append('conflictType', filter.conflictType);

      const response = await fetch(`/api/v1/ssot/conflicts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch conflicts');

      const data = await response.json();
      setConflicts(data.conflicts);
      setTotal(data.total);
    } catch (error) {
      console.error('Error fetching conflicts:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/v1/ssot/conflicts/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchConflicts();
    fetchStats();
  }, [fetchConflicts]);

  const handleSelectConflict = (conflict: DataConflict) => {
    setSelectedConflict(conflict);
    setMergedValue(String(conflict.masterValue));
    setResolutionNotes('');
  };

  const handleResolve = async (resolution: 'keep_master' | 'accept_source' | 'merge') => {
    if (!selectedConflict) return;

    try {
      setLoading(true);
      const body: Record<string, unknown> = {
        resolution,
        notes: resolutionNotes,
      };

      if (resolution === 'merge') {
        try {
          body.mergedValue = JSON.parse(mergedValue);
        } catch {
          body.mergedValue = mergedValue;
        }
      }

      const response = await fetch(`/api/v1/ssot/conflicts/${selectedConflict.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Failed to resolve conflict');

      setSelectedConflict(null);
      fetchConflicts();
      fetchStats();
      onConflictResolved?.();
    } catch (error) {
      console.error('Resolve error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIgnore = async () => {
    if (!selectedConflict) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v1/ssot/conflicts/${selectedConflict.id}/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: resolutionNotes || 'Ignored by user' }),
      });

      if (!response.ok) throw new Error('Failed to ignore conflict');

      setSelectedConflict(null);
      fetchConflicts();
      fetchStats();
      onConflictResolved?.();
    } catch (error) {
      console.error('Ignore error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedConflict) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v1/ssot/conflicts/${selectedConflict.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: resolutionNotes || 'Needs review' }),
      });

      if (!response.ok) throw new Error('Failed to escalate conflict');

      setSelectedConflict(null);
      fetchConflicts();
      fetchStats();
      onConflictResolved?.();
    } catch (error) {
      console.error('Escalate error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoResolve = async () => {
    if (!confirm('Auto-resolve all pending conflicts based on configured strategy?')) return;

    try {
      setLoading(true);
      const response = await fetch('/api/v1/ssot/conflicts/auto-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to auto-resolve');

      const data = await response.json();
      alert(`Resolved: ${data.resolved}, Failed: ${data.failed}`);

      fetchConflicts();
      fetchStats();
      onConflictResolved?.();
    } catch (error) {
      console.error('Auto-resolve error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="conflict-resolver">
      <style>{styles}</style>

      {/* Stats Header */}
      {stats && (
        <div className="stats-header">
          <div className="stat-item pending">
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-item resolved">
            <span className="stat-value">{stats.resolved}</span>
            <span className="stat-label">Resolved</span>
          </div>
          <div className="stat-item ignored">
            <span className="stat-value">{stats.ignored}</span>
            <span className="stat-label">Ignored</span>
          </div>
          <div className="stat-item escalated">
            <span className="stat-value">{stats.escalated}</span>
            <span className="stat-label">Escalated</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {stats.avgResolutionTime > 0
                ? `${Math.round(stats.avgResolutionTime / 3600)}h`
                : '-'}
            </span>
            <span className="stat-label">Avg Resolution</span>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="filter-bar">
        <div className="filters">
          <select
            value={filter.status || ''}
            onChange={(e) => {
              setFilter((f) => ({ ...f, status: e.target.value || undefined }));
              setPage(0);
            }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={filter.conflictType || ''}
            onChange={(e) => {
              setFilter((f) => ({ ...f, conflictType: e.target.value || undefined }));
              setPage(0);
            }}
          >
            <option value="">All Types</option>
            <option value="field_value">Field Value</option>
            <option value="record_existence">Record Existence</option>
            <option value="relationship">Relationship</option>
            <option value="schema">Schema</option>
          </select>
        </div>

        <button
          onClick={handleAutoResolve}
          className="auto-resolve-btn"
          disabled={loading || !stats?.pending}
        >
          Auto-Resolve All
        </button>
      </div>

      <div className="conflict-content">
        {/* Conflict List */}
        <div className="conflict-list">
          {loading && conflicts.length === 0 && (
            <div className="loading-indicator">Loading conflicts...</div>
          )}

          {conflicts.length === 0 && !loading && (
            <div className="empty-state">No conflicts found</div>
          )}

          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className={`conflict-item ${selectedConflict?.id === conflict.id ? 'selected' : ''} ${conflict.status}`}
              onClick={() => handleSelectConflict(conflict)}
            >
              <div className="conflict-header">
                <span
                  className="status-badge"
                  style={{ backgroundColor: STATUS_COLORS[conflict.status] }}
                >
                  {conflict.status}
                </span>
                <span className="type-badge">{TYPE_LABELS[conflict.conflictType]}</span>
              </div>
              <div className="conflict-field">
                {conflict.field ? (
                  <span>
                    Field: <strong>{conflict.field}</strong>
                  </span>
                ) : (
                  <span>Record-level conflict</span>
                )}
              </div>
              <div className="conflict-source">
                Source: {conflict.sourceName}
              </div>
              <div className="conflict-time">
                {new Date(conflict.detectedAt).toLocaleDateString()}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {total > pageSize && (
            <div className="pagination">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <button
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Conflict Detail */}
        <div className="conflict-detail">
          {selectedConflict ? (
            <>
              <h3>Resolve Conflict</h3>

              <div className="conflict-info">
                <div className="info-row">
                  <span className="info-label">Type:</span>
                  <span className="info-value">{TYPE_LABELS[selectedConflict.conflictType]}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Source:</span>
                  <span className="info-value">{selectedConflict.sourceName}</span>
                </div>
                {selectedConflict.field && (
                  <div className="info-row">
                    <span className="info-label">Field:</span>
                    <span className="info-value">{selectedConflict.field}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">Detected:</span>
                  <span className="info-value">
                    {new Date(selectedConflict.detectedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Value Comparison */}
              <div className="value-comparison">
                <div className="value-panel master">
                  <h4>Master Value</h4>
                  <div className="value-content">
                    <pre>{formatValue(selectedConflict.masterValue)}</pre>
                  </div>
                  <button
                    className="select-btn"
                    onClick={() => handleResolve('keep_master')}
                    disabled={loading || selectedConflict.status !== 'pending'}
                  >
                    Keep Master
                  </button>
                </div>

                <div className="value-divider">
                  <span>VS</span>
                </div>

                <div className="value-panel source">
                  <h4>Source Value</h4>
                  <div className="value-content">
                    <pre>{formatValue(selectedConflict.sourceValue)}</pre>
                  </div>
                  <button
                    className="select-btn"
                    onClick={() => handleResolve('accept_source')}
                    disabled={loading || selectedConflict.status !== 'pending'}
                  >
                    Accept Source
                  </button>
                </div>
              </div>

              {/* Merge Option */}
              {selectedConflict.status === 'pending' && (
                <div className="merge-section">
                  <h4>Or Merge Values</h4>
                  <textarea
                    value={mergedValue}
                    onChange={(e) => setMergedValue(e.target.value)}
                    rows={3}
                    placeholder="Enter merged value..."
                  />
                  <button
                    className="merge-btn"
                    onClick={() => handleResolve('merge')}
                    disabled={loading}
                  >
                    Apply Merged Value
                  </button>
                </div>
              )}

              {/* Notes */}
              <div className="notes-section">
                <label>Resolution Notes</label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={2}
                  placeholder="Add notes about this resolution..."
                  disabled={selectedConflict.status !== 'pending'}
                />
              </div>

              {/* Secondary Actions */}
              {selectedConflict.status === 'pending' && (
                <div className="secondary-actions">
                  <button
                    className="ignore-btn"
                    onClick={handleIgnore}
                    disabled={loading}
                  >
                    Ignore
                  </button>
                  <button
                    className="escalate-btn"
                    onClick={handleEscalate}
                    disabled={loading}
                  >
                    Escalate
                  </button>
                </div>
              )}

              {/* Resolution Info */}
              {selectedConflict.status !== 'pending' && (
                <div className="resolution-info">
                  <h4>Resolution</h4>
                  <div className="resolution-details">
                    <p>
                      <strong>Method:</strong> {selectedConflict.resolution || selectedConflict.status}
                    </p>
                    {selectedConflict.resolvedBy && (
                      <p>
                        <strong>Resolved by:</strong> {selectedConflict.resolvedBy}
                      </p>
                    )}
                    {selectedConflict.resolvedAt && (
                      <p>
                        <strong>Resolved at:</strong>{' '}
                        {new Date(selectedConflict.resolvedAt).toLocaleString()}
                      </p>
                    )}
                    {selectedConflict.resolutionNotes && (
                      <p>
                        <strong>Notes:</strong> {selectedConflict.resolutionNotes}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-detail">
              <p>Select a conflict to view details and resolve</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = `
  .conflict-resolver {
    min-height: 500px;
  }

  .stats-header {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .stat-item {
    flex: 1;
    text-align: center;
    padding: 12px;
    border-radius: 8px;
    background: #f9fafb;
  }

  .stat-item.pending { background: #fff7ed; }
  .stat-item.resolved { background: #f0fdf4; }
  .stat-item.ignored { background: #f3f4f6; }
  .stat-item.escalated { background: #fef2f2; }

  .stat-value {
    display: block;
    font-size: 28px;
    font-weight: bold;
    color: #111827;
  }

  .stat-label {
    font-size: 12px;
    color: #6b7280;
  }

  .filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .filters {
    display: flex;
    gap: 12px;
  }

  .filters select {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
  }

  .auto-resolve-btn {
    background: #f97316;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .auto-resolve-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .conflict-content {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 24px;
  }

  .conflict-list {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    max-height: 600px;
    overflow-y: auto;
  }

  .loading-indicator, .empty-state {
    padding: 32px;
    text-align: center;
    color: #6b7280;
  }

  .conflict-item {
    padding: 16px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background 0.2s;
  }

  .conflict-item:hover {
    background: #f9fafb;
  }

  .conflict-item.selected {
    background: #dbeafe;
    border-left: 3px solid #3b82f6;
  }

  .conflict-header {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    color: white;
    text-transform: uppercase;
  }

  .type-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    background: #e5e7eb;
    color: #374151;
  }

  .conflict-field {
    font-size: 14px;
    color: #374151;
    margin-bottom: 4px;
  }

  .conflict-source {
    font-size: 12px;
    color: #6b7280;
  }

  .conflict-time {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
  }

  .pagination button {
    background: #f3f4f6;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .conflict-detail {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    padding: 24px;
  }

  .conflict-detail h3 {
    margin: 0 0 20px;
    font-size: 18px;
    color: #111827;
  }

  .conflict-info {
    margin-bottom: 24px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .info-row {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .info-label {
    font-size: 13px;
    color: #6b7280;
    width: 80px;
  }

  .info-value {
    font-size: 13px;
    color: #374151;
    font-weight: 500;
  }

  .value-comparison {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }

  .value-panel {
    padding: 16px;
    border-radius: 8px;
    border: 2px solid #e5e7eb;
  }

  .value-panel.master {
    border-color: #3b82f6;
  }

  .value-panel.source {
    border-color: #f97316;
  }

  .value-panel h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #374151;
  }

  .value-content {
    margin-bottom: 12px;
  }

  .value-content pre {
    margin: 0;
    padding: 12px;
    background: #f3f4f6;
    border-radius: 4px;
    font-size: 13px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .select-btn {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .value-panel.master .select-btn {
    background: #3b82f6;
    color: white;
  }

  .value-panel.source .select-btn {
    background: #f97316;
    color: white;
  }

  .select-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .value-divider {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .value-divider span {
    background: #e5e7eb;
    padding: 8px 12px;
    border-radius: 20px;
    font-weight: 600;
    color: #6b7280;
  }

  .merge-section {
    margin-bottom: 24px;
    padding: 16px;
    background: #faf5ff;
    border-radius: 8px;
    border: 2px solid #a855f7;
  }

  .merge-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #374151;
  }

  .merge-section textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 12px;
    font-family: monospace;
    resize: vertical;
  }

  .merge-btn {
    width: 100%;
    padding: 10px;
    background: #a855f7;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .merge-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .notes-section {
    margin-bottom: 24px;
  }

  .notes-section label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 8px;
  }

  .notes-section textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    resize: vertical;
  }

  .secondary-actions {
    display: flex;
    gap: 12px;
  }

  .ignore-btn, .escalate-btn {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .ignore-btn {
    background: #f3f4f6;
    color: #374151;
    border: none;
  }

  .escalate-btn {
    background: #fee2e2;
    color: #ef4444;
    border: none;
  }

  .resolution-info {
    padding: 16px;
    background: #f0fdf4;
    border-radius: 8px;
    border: 1px solid #22c55e;
  }

  .resolution-info h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #166534;
  }

  .resolution-details p {
    margin: 0 0 8px;
    font-size: 13px;
    color: #374151;
  }

  .empty-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    .conflict-content {
      grid-template-columns: 1fr;
    }

    .value-comparison {
      grid-template-columns: 1fr;
    }

    .value-divider {
      padding: 16px 0;
    }
  }
`;

export default ConflictResolver;
