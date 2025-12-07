/**
 * Sync Status Monitor Component
 * Monitors and manages sync jobs with legacy systems
 * T293 - Sync status monitor
 */

import React, { useState, useEffect, useCallback } from 'react';

interface SyncJob {
  id: string;
  organizationId: string;
  sourceId: string;
  sourceName: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';
  entityTypes: string[];
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  conflictsDetected: number;
  errors: Array<{
    recordId?: string;
    externalId?: string;
    message: string;
    code: string;
    timestamp: string;
  }>;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

interface SyncStatus {
  lastSync?: string;
  lastStatus?: string;
  recordCount: number;
  pendingConflicts: number;
  recentJobs: SyncJob[];
}

interface SyncStatusMonitorProps {
  organizationId: string;
  onSyncComplete?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  partial: '#f97316',
};

const DIRECTION_LABELS: Record<string, { label: string; icon: string }> = {
  inbound: { label: 'Inbound', icon: '\u2193' },
  outbound: { label: 'Outbound', icon: '\u2191' },
  bidirectional: { label: 'Bidirectional', icon: '\u21C4' },
};

export const SyncStatusMonitor: React.FC<SyncStatusMonitorProps> = ({
  organizationId,
  onSyncComplete,
}) => {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [sourceStatus, setSourceStatus] = useState<SyncStatus | null>(null);
  const [selectedJob, setSelectedJob] = useState<SyncJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [newJobConfig, setNewJobConfig] = useState({
    sourceId: '',
    sourceName: '',
    direction: 'inbound' as 'inbound' | 'outbound' | 'bidirectional',
    entityTypes: ['company', 'person', 'product'],
  });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });

      if (selectedSource) {
        params.append('sourceId', selectedSource);
      }

      const response = await fetch(`/api/v1/ssot/sync/jobs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch jobs');

      const data = await response.json();
      setJobs(data.jobs);
      setTotal(data.total);

      // Extract unique sources
      const sourceSet = new Set<string>();
      data.jobs.forEach((job: SyncJob) => sourceSet.add(job.sourceId));
      setSources(Array.from(sourceSet));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [page, selectedSource]);

  const fetchSourceStatus = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/v1/ssot/sync/status/${sourceId}`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setSourceStatus(data);
    } catch (error) {
      console.error('Error fetching source status:', error);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    if (selectedSource) {
      fetchSourceStatus(selectedSource);
    } else {
      setSourceStatus(null);
    }
  }, [selectedSource]);

  const handleStartJob = async () => {
    if (!newJobConfig.sourceId || !newJobConfig.sourceName) {
      alert('Please enter source ID and name');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/v1/ssot/sync/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJobConfig),
      });

      if (!response.ok) throw new Error('Failed to start job');

      const job = await response.json();
      setSelectedJob(job);
      setIsStartingJob(false);
      fetchJobs();
    } catch (error) {
      console.error('Start job error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/ssot/sync/jobs/${jobId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to retry job');

      const newJob = await response.json();
      setSelectedJob(newJob);
      fetchJobs();
    } catch (error) {
      console.error('Retry job error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (startedAt: string, completedAt?: string): string => {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const getProgressPercentage = (job: SyncJob): number => {
    if (job.status === 'completed' || job.status === 'partial') return 100;
    if (job.status === 'pending') return 0;
    if (job.recordsProcessed === 0) return 10; // Some progress shown
    return Math.min(90, Math.floor((job.recordsProcessed / (job.recordsProcessed + 10)) * 100));
  };

  return (
    <div className="sync-status-monitor">
      <style>{styles}</style>

      {/* Header */}
      <div className="monitor-header">
        <div className="header-left">
          <h2>Sync Status Monitor</h2>
          <p>Monitor and manage data synchronization with legacy systems</p>
        </div>
        <button
          className="start-sync-btn"
          onClick={() => setIsStartingJob(true)}
        >
          + Start New Sync
        </button>
      </div>

      {/* Source Filter */}
      <div className="filter-section">
        <select
          value={selectedSource}
          onChange={(e) => {
            setSelectedSource(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All Sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        <button onClick={fetchJobs} className="refresh-btn" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Source Status */}
      {selectedSource && sourceStatus && (
        <div className="source-status">
          <div className="status-card">
            <span className="status-label">Last Sync</span>
            <span className="status-value">
              {sourceStatus.lastSync
                ? new Date(sourceStatus.lastSync).toLocaleString()
                : 'Never'}
            </span>
          </div>
          <div className="status-card">
            <span className="status-label">Records</span>
            <span className="status-value">{sourceStatus.recordCount}</span>
          </div>
          <div className="status-card warning">
            <span className="status-label">Pending Conflicts</span>
            <span className="status-value">{sourceStatus.pendingConflicts}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Status</span>
            <span className={`status-badge ${sourceStatus.lastStatus || 'unknown'}`}>
              {sourceStatus.lastStatus || 'Unknown'}
            </span>
          </div>
        </div>
      )}

      {/* Jobs Grid */}
      <div className="jobs-content">
        {/* Jobs List */}
        <div className="jobs-list">
          {loading && jobs.length === 0 && (
            <div className="loading-indicator">Loading jobs...</div>
          )}

          {jobs.length === 0 && !loading && (
            <div className="empty-state">
              <p>No sync jobs found</p>
              <button onClick={() => setIsStartingJob(true)}>Start First Sync</button>
            </div>
          )}

          {jobs.map((job) => (
            <div
              key={job.id}
              className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''} ${job.status}`}
              onClick={() => setSelectedJob(job)}
            >
              <div className="job-header">
                <span className="job-source">{job.sourceName}</span>
                <span className="job-direction">
                  {DIRECTION_LABELS[job.direction].icon} {DIRECTION_LABELS[job.direction].label}
                </span>
              </div>

              <div className="job-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${getProgressPercentage(job)}%`,
                      backgroundColor: STATUS_COLORS[job.status],
                    }}
                  />
                </div>
              </div>

              <div className="job-stats">
                <span className="stat">
                  <span className="stat-num">{job.recordsCreated}</span> created
                </span>
                <span className="stat">
                  <span className="stat-num">{job.recordsUpdated}</span> updated
                </span>
                {job.conflictsDetected > 0 && (
                  <span className="stat warning">
                    <span className="stat-num">{job.conflictsDetected}</span> conflicts
                  </span>
                )}
              </div>

              <div className="job-footer">
                <span
                  className="status-badge small"
                  style={{ backgroundColor: STATUS_COLORS[job.status] }}
                >
                  {job.status.replace('_', ' ')}
                </span>
                <span className="job-time">
                  {formatDuration(job.startedAt, job.completedAt)}
                </span>
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
                {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
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

        {/* Job Detail */}
        <div className="job-detail">
          {selectedJob ? (
            <>
              <div className="detail-header">
                <h3>Job Details</h3>
                {(selectedJob.status === 'failed' || selectedJob.status === 'partial') && (
                  <button
                    className="retry-btn"
                    onClick={() => handleRetryJob(selectedJob.id)}
                    disabled={loading}
                  >
                    Retry Job
                  </button>
                )}
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Job ID</span>
                  <span className="detail-value mono">{selectedJob.id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Source</span>
                  <span className="detail-value">{selectedJob.sourceName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Source ID</span>
                  <span className="detail-value mono">{selectedJob.sourceId}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Direction</span>
                  <span className="detail-value">
                    {DIRECTION_LABELS[selectedJob.direction].label}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Entity Types</span>
                  <span className="detail-value">
                    {selectedJob.entityTypes.join(', ')}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Started</span>
                  <span className="detail-value">
                    {new Date(selectedJob.startedAt).toLocaleString()}
                  </span>
                </div>
                {selectedJob.completedAt && (
                  <div className="detail-item">
                    <span className="detail-label">Completed</span>
                    <span className="detail-value">
                      {new Date(selectedJob.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="detail-item">
                  <span className="detail-label">Duration</span>
                  <span className="detail-value">
                    {formatDuration(selectedJob.startedAt, selectedJob.completedAt)}
                  </span>
                </div>
              </div>

              <div className="stats-section">
                <h4>Processing Statistics</h4>
                <div className="stats-grid">
                  <div className="stats-item">
                    <span className="stats-num">{selectedJob.recordsProcessed}</span>
                    <span className="stats-label">Processed</span>
                  </div>
                  <div className="stats-item success">
                    <span className="stats-num">{selectedJob.recordsCreated}</span>
                    <span className="stats-label">Created</span>
                  </div>
                  <div className="stats-item success">
                    <span className="stats-num">{selectedJob.recordsUpdated}</span>
                    <span className="stats-label">Updated</span>
                  </div>
                  <div className="stats-item">
                    <span className="stats-num">{selectedJob.recordsSkipped}</span>
                    <span className="stats-label">Skipped</span>
                  </div>
                  {selectedJob.conflictsDetected > 0 && (
                    <div className="stats-item warning">
                      <span className="stats-num">{selectedJob.conflictsDetected}</span>
                      <span className="stats-label">Conflicts</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Errors */}
              {selectedJob.errors.length > 0 && (
                <div className="errors-section">
                  <h4>Errors ({selectedJob.errors.length})</h4>
                  <div className="errors-list">
                    {selectedJob.errors.slice(0, 10).map((error, idx) => (
                      <div key={idx} className="error-item">
                        <div className="error-header">
                          <span className="error-code">{error.code}</span>
                          <span className="error-time">
                            {new Date(error.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="error-message">{error.message}</p>
                        {error.externalId && (
                          <span className="error-id">Record: {error.externalId}</span>
                        )}
                      </div>
                    ))}
                    {selectedJob.errors.length > 10 && (
                      <p className="errors-more">
                        And {selectedJob.errors.length - 10} more errors...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-detail">
              <p>Select a job to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Start Job Modal */}
      {isStartingJob && (
        <div className="modal-overlay" onClick={() => setIsStartingJob(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Start New Sync Job</h3>

            <div className="form-group">
              <label>Source ID</label>
              <input
                type="text"
                value={newJobConfig.sourceId}
                onChange={(e) =>
                  setNewJobConfig((c) => ({ ...c, sourceId: e.target.value }))
                }
                placeholder="e.g., salesforce-001"
              />
            </div>

            <div className="form-group">
              <label>Source Name</label>
              <input
                type="text"
                value={newJobConfig.sourceName}
                onChange={(e) =>
                  setNewJobConfig((c) => ({ ...c, sourceName: e.target.value }))
                }
                placeholder="e.g., Salesforce CRM"
              />
            </div>

            <div className="form-group">
              <label>Direction</label>
              <select
                value={newJobConfig.direction}
                onChange={(e) =>
                  setNewJobConfig((c) => ({
                    ...c,
                    direction: e.target.value as 'inbound' | 'outbound' | 'bidirectional',
                  }))
                }
              >
                <option value="inbound">Inbound (Legacy to SSOT)</option>
                <option value="outbound">Outbound (SSOT to Legacy)</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </div>

            <div className="form-group">
              <label>Entity Types</label>
              <div className="checkbox-group">
                {['company', 'person', 'product', 'address', 'contact'].map((type) => (
                  <label key={type} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newJobConfig.entityTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewJobConfig((c) => ({
                            ...c,
                            entityTypes: [...c.entityTypes, type],
                          }));
                        } else {
                          setNewJobConfig((c) => ({
                            ...c,
                            entityTypes: c.entityTypes.filter((t) => t !== type),
                          }));
                        }
                      }}
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setIsStartingJob(false)}>
                Cancel
              </button>
              <button
                className="start-btn"
                onClick={handleStartJob}
                disabled={loading || !newJobConfig.sourceId || !newJobConfig.sourceName}
              >
                {loading ? 'Starting...' : 'Start Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = `
  .sync-status-monitor {
    min-height: 500px;
  }

  .monitor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header-left h2 {
    margin: 0 0 4px;
    font-size: 20px;
    color: #111827;
  }

  .header-left p {
    margin: 0;
    color: #6b7280;
    font-size: 14px;
  }

  .start-sync-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .filter-section {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .filter-section select {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    min-width: 200px;
  }

  .refresh-btn {
    background: #f3f4f6;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
  }

  .source-status {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .status-card {
    text-align: center;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .status-card.warning {
    background: #fff7ed;
  }

  .status-label {
    display: block;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .status-value {
    display: block;
    font-size: 18px;
    font-weight: 600;
    color: #111827;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .status-badge.completed { background: #dcfce7; color: #166534; }
  .status-badge.failed { background: #fee2e2; color: #991b1b; }
  .status-badge.pending { background: #f3f4f6; color: #374151; }
  .status-badge.in_progress { background: #dbeafe; color: #1e40af; }
  .status-badge.partial { background: #fff7ed; color: #9a3412; }

  .jobs-content {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 24px;
  }

  .jobs-list {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .loading-indicator, .empty-state {
    padding: 32px;
    text-align: center;
    color: #6b7280;
  }

  .empty-state button {
    margin-top: 12px;
    background: #3b82f6;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
  }

  .job-card {
    padding: 16px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background 0.2s;
  }

  .job-card:hover {
    background: #f9fafb;
  }

  .job-card.selected {
    background: #dbeafe;
    border-left: 3px solid #3b82f6;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .job-source {
    font-weight: 600;
    color: #374151;
  }

  .job-direction {
    font-size: 12px;
    color: #6b7280;
  }

  .job-progress {
    margin-bottom: 8px;
  }

  .progress-bar {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s;
  }

  .job-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
  }

  .stat {
    font-size: 12px;
    color: #6b7280;
  }

  .stat-num {
    font-weight: 600;
    color: #374151;
  }

  .stat.warning {
    color: #f97316;
  }

  .stat.warning .stat-num {
    color: #f97316;
  }

  .job-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-badge.small {
    font-size: 10px;
    padding: 2px 8px;
    color: white;
  }

  .job-time {
    font-size: 11px;
    color: #9ca3af;
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

  .job-detail {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    padding: 24px;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .detail-header h3 {
    margin: 0;
    font-size: 18px;
    color: #111827;
  }

  .retry-btn {
    background: #f97316;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    font-size: 12px;
    color: #9ca3af;
  }

  .detail-value {
    font-size: 14px;
    color: #374151;
  }

  .detail-value.mono {
    font-family: monospace;
    font-size: 12px;
  }

  .stats-section {
    margin-bottom: 24px;
  }

  .stats-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #374151;
  }

  .stats-grid {
    display: flex;
    gap: 16px;
  }

  .stats-item {
    flex: 1;
    text-align: center;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .stats-item.success {
    background: #f0fdf4;
  }

  .stats-item.warning {
    background: #fff7ed;
  }

  .stats-num {
    display: block;
    font-size: 24px;
    font-weight: bold;
    color: #111827;
  }

  .stats-item.success .stats-num {
    color: #22c55e;
  }

  .stats-item.warning .stats-num {
    color: #f97316;
  }

  .stats-label {
    font-size: 12px;
    color: #6b7280;
  }

  .errors-section {
    padding: 16px;
    background: #fef2f2;
    border-radius: 8px;
    border: 1px solid #fee2e2;
  }

  .errors-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #991b1b;
  }

  .errors-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .error-item {
    padding: 12px;
    background: white;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .error-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .error-code {
    font-size: 12px;
    font-weight: 600;
    color: #ef4444;
  }

  .error-time {
    font-size: 11px;
    color: #9ca3af;
  }

  .error-message {
    margin: 0 0 4px;
    font-size: 13px;
    color: #374151;
  }

  .error-id {
    font-size: 11px;
    color: #6b7280;
  }

  .errors-more {
    margin: 8px 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .empty-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #9ca3af;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    padding: 24px;
    border-radius: 12px;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .modal-content h3 {
    margin: 0 0 20px;
    font-size: 18px;
    color: #111827;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
  }

  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .cancel-btn {
    background: #f3f4f6;
    color: #374151;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
  }

  .start-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
  }

  .start-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .jobs-content {
      grid-template-columns: 1fr;
    }

    .source-status {
      grid-template-columns: repeat(2, 1fr);
    }

    .stats-grid {
      flex-wrap: wrap;
    }

    .stats-item {
      min-width: calc(50% - 8px);
    }
  }
`;

export default SyncStatusMonitor;
