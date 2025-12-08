/**
 * Deadline Manager Component
 * T199 - Manage compliance deadlines and schedules
 *
 * Calendar-style view with deadline tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ComplianceDeadline {
  id: string;
  title: string;
  description: string;
  framework: ComplianceFramework;
  category: string;
  type: 'audit' | 'report' | 'certification' | 'review' | 'assessment' | 'other';
  dueDate: string;
  reminderDays: number[];
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assigneeId?: string;
  assigneeName?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  recurring?: {
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
    interval: number;
    endDate?: string;
  };
  dependencies?: string[];
  attachments?: Array<{ id: string; name: string; url: string }>;
}

export interface DeadlineStatistics {
  total: number;
  upcoming: number;
  dueSoon: number;
  overdue: number;
  completed: number;
  byFramework: Record<string, number>;
  byPriority: Record<string, number>;
}

interface DeadlineManagerProps {
  organizationId: string;
  framework?: ComplianceFramework;
  onDeadlineSelect?: (deadline: ComplianceDeadline) => void;
}

type ViewMode = 'list' | 'calendar' | 'timeline';
type FilterStatus = 'all' | 'upcoming' | 'due_soon' | 'overdue' | 'completed';

const DEADLINE_TYPE_ICONS: Record<ComplianceDeadline['type'], string> = {
  audit: '📋',
  report: '📊',
  certification: '🏆',
  review: '🔍',
  assessment: '📝',
  other: '📌',
};

export function DeadlineManager({
  organizationId,
  framework,
  onDeadlineSelect,
}: DeadlineManagerProps) {
  const [deadlines, setDeadlines] = useState<ComplianceDeadline[]>([]);
  const [statistics, setStatistics] = useState<DeadlineStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<ComplianceDeadline | null>(null);

  const fetchDeadlines = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId });
      if (framework) params.append('framework', framework);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const [deadlinesRes, statsRes] = await Promise.all([
        fetch(`/api/compliance/deadlines?${params}`),
        fetch(`/api/compliance/deadlines/statistics?${params}`),
      ]);

      if (!deadlinesRes.ok) throw new Error('Failed to fetch deadlines');

      const deadlinesData = await deadlinesRes.json();
      setDeadlines(deadlinesData.deadlines);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStatistics(statsData.statistics);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, framework, statusFilter]);

  useEffect(() => {
    fetchDeadlines();
  }, [fetchDeadlines]);

  const handleCreateDeadline = async (deadline: Partial<ComplianceDeadline>) => {
    try {
      const response = await fetch('/api/compliance/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deadline, organizationId }),
      });

      if (!response.ok) throw new Error('Failed to create deadline');

      await fetchDeadlines();
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleUpdateDeadline = async (id: string, updates: Partial<ComplianceDeadline>) => {
    try {
      const response = await fetch(`/api/compliance/deadlines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update deadline');

      await fetchDeadlines();
      setEditingDeadline(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleCompleteDeadline = async (id: string) => {
    try {
      const response = await fetch(`/api/compliance/deadlines/${id}/complete`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to complete deadline');

      await fetchDeadlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Complete failed');
    }
  };

  const handleDeleteDeadline = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deadline?')) return;

    try {
      const response = await fetch(`/api/compliance/deadlines/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete deadline');

      await fetchDeadlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // Group deadlines by date for calendar view
  const deadlinesByDate = deadlines.reduce<Record<string, ComplianceDeadline[]>>((acc, d) => {
    const date = new Date(d.dueDate).toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(d);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="deadline-manager loading">
        <div className="spinner" />
        <p>Loading deadlines...</p>
      </div>
    );
  }

  return (
    <div className="deadline-manager">
      {/* Header */}
      <header className="manager-header">
        {statistics && (
          <div className="stats-bar">
            <div className="stat">
              <span className="value">{statistics.total}</span>
              <span className="label">Total</span>
            </div>
            <div className="stat upcoming">
              <span className="value">{statistics.upcoming}</span>
              <span className="label">Upcoming</span>
            </div>
            <div className="stat due-soon">
              <span className="value">{statistics.dueSoon}</span>
              <span className="label">Due Soon</span>
            </div>
            <div className="stat overdue">
              <span className="value">{statistics.overdue}</span>
              <span className="label">Overdue</span>
            </div>
          </div>
        )}

        <div className="header-actions">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Add Deadline
          </button>
        </div>
      </header>

      {/* Controls */}
      <div className="manager-controls">
        <div className="filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="due_soon">Due Soon</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            📋 List
          </button>
          <button
            className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            📅 Calendar
          </button>
          <button
            className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            ⏱️ Timeline
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

      {/* Content */}
      <div className="manager-content">
        {deadlines.length === 0 ? (
          <div className="empty-state">
            <p>No deadlines found.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create First Deadline
            </button>
          </div>
        ) : viewMode === 'list' ? (
          <DeadlineListView
            deadlines={deadlines}
            onSelect={onDeadlineSelect}
            onEdit={setEditingDeadline}
            onComplete={handleCompleteDeadline}
            onDelete={handleDeleteDeadline}
          />
        ) : viewMode === 'calendar' ? (
          <DeadlineCalendarView
            deadlines={deadlines}
            deadlinesByDate={deadlinesByDate}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            onSelect={onDeadlineSelect}
          />
        ) : (
          <DeadlineTimelineView
            deadlines={deadlines}
            onSelect={onDeadlineSelect}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingDeadline) && (
        <DeadlineFormModal
          deadline={editingDeadline || undefined}
          onSave={(deadline) => {
            if (editingDeadline) {
              handleUpdateDeadline(editingDeadline.id, deadline);
            } else {
              handleCreateDeadline(deadline);
            }
          }}
          onClose={() => {
            setShowCreateModal(false);
            setEditingDeadline(null);
          }}
        />
      )}
    </div>
  );
}

// List View Component
interface DeadlineListViewProps {
  deadlines: ComplianceDeadline[];
  onSelect?: (deadline: ComplianceDeadline) => void;
  onEdit: (deadline: ComplianceDeadline) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

function DeadlineListView({
  deadlines,
  onSelect,
  onEdit,
  onComplete,
  onDelete,
}: DeadlineListViewProps) {
  const sortedDeadlines = [...deadlines].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  return (
    <div className="deadline-list">
      {sortedDeadlines.map((deadline) => (
        <div
          key={deadline.id}
          className={`deadline-card ${deadline.status} ${deadline.priority}`}
          onClick={() => onSelect?.(deadline)}
        >
          <div className="card-icon">
            {DEADLINE_TYPE_ICONS[deadline.type]}
          </div>

          <div className="card-content">
            <div className="card-header">
              <h4>{deadline.title}</h4>
              <span className={`status-badge ${deadline.status}`}>
                {deadline.status.replace('_', ' ')}
              </span>
            </div>

            <p className="description">{deadline.description}</p>

            <div className="card-meta">
              <span className="due-date">
                Due: {new Date(deadline.dueDate).toLocaleDateString()}
              </span>
              <span className="framework">{deadline.framework}</span>
              <span className={`priority ${deadline.priority}`}>
                {deadline.priority}
              </span>
              {deadline.assigneeName && (
                <span className="assignee">{deadline.assigneeName}</span>
              )}
            </div>
          </div>

          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            {deadline.status !== 'completed' && (
              <button
                onClick={() => onComplete(deadline.id)}
                className="btn btn-small btn-success"
              >
                Complete
              </button>
            )}
            <button
              onClick={() => onEdit(deadline)}
              className="btn btn-small"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(deadline.id)}
              className="btn btn-small btn-danger"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Calendar View Component
interface DeadlineCalendarViewProps {
  deadlines: ComplianceDeadline[];
  deadlinesByDate: Record<string, ComplianceDeadline[]>;
  selectedMonth: Date;
  onMonthChange: (date: Date) => void;
  onSelect?: (deadline: ComplianceDeadline) => void;
}

function DeadlineCalendarView({
  deadlinesByDate,
  selectedMonth,
  onMonthChange,
  onSelect,
}: DeadlineCalendarViewProps) {
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: Array<{ date: Date | null; deadlines: ComplianceDeadline[] }> = [];

  // Add empty cells for offset
  for (let i = 0; i < startOffset; i++) {
    days.push({ date: null, deadlines: [] });
  }

  // Add days of month
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    const dateKey = date.toISOString().split('T')[0];
    days.push({ date, deadlines: deadlinesByDate[dateKey] || [] });
  }

  const prevMonth = () => {
    onMonthChange(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    onMonthChange(new Date(year, month + 1, 1));
  };

  return (
    <div className="deadline-calendar">
      <div className="calendar-header">
        <button onClick={prevMonth} className="btn btn-icon">&lt;</button>
        <h3>
          {selectedMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <button onClick={nextMonth} className="btn btn-icon">&gt;</button>
      </div>

      <div className="calendar-grid">
        <div className="weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>

        <div className="days">
          {days.map((day, i) => (
            <div
              key={i}
              className={`day ${!day.date ? 'empty' : ''} ${
                day.date?.toDateString() === new Date().toDateString() ? 'today' : ''
              } ${day.deadlines.length > 0 ? 'has-deadlines' : ''}`}
            >
              {day.date && (
                <>
                  <span className="day-number">{day.date.getDate()}</span>
                  {day.deadlines.length > 0 && (
                    <div className="day-deadlines">
                      {day.deadlines.slice(0, 3).map((d) => (
                        <div
                          key={d.id}
                          className={`deadline-dot ${d.status} ${d.priority}`}
                          onClick={() => onSelect?.(d)}
                          title={d.title}
                        >
                          {DEADLINE_TYPE_ICONS[d.type]}
                        </div>
                      ))}
                      {day.deadlines.length > 3 && (
                        <span className="more-count">+{day.deadlines.length - 3}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Timeline View Component
interface DeadlineTimelineViewProps {
  deadlines: ComplianceDeadline[];
  onSelect?: (deadline: ComplianceDeadline) => void;
}

function DeadlineTimelineView({ deadlines, onSelect }: DeadlineTimelineViewProps) {
  const sortedDeadlines = [...deadlines].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  const today = new Date();

  return (
    <div className="deadline-timeline">
      <div className="timeline-track">
        {sortedDeadlines.map((deadline, i) => {
          const dueDate = new Date(deadline.dueDate);
          const isPast = dueDate < today;

          return (
            <div
              key={deadline.id}
              className={`timeline-item ${deadline.status} ${isPast ? 'past' : 'future'}`}
              onClick={() => onSelect?.(deadline)}
            >
              <div className="timeline-marker">
                <span className="marker-icon">{DEADLINE_TYPE_ICONS[deadline.type]}</span>
              </div>
              <div className="timeline-content">
                <span className="timeline-date">
                  {dueDate.toLocaleDateString()}
                </span>
                <h4>{deadline.title}</h4>
                <span className={`priority-badge ${deadline.priority}`}>
                  {deadline.priority}
                </span>
              </div>
              {i < sortedDeadlines.length - 1 && <div className="timeline-connector" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Deadline Form Modal
interface DeadlineFormModalProps {
  deadline?: ComplianceDeadline;
  onSave: (deadline: Partial<ComplianceDeadline>) => void;
  onClose: () => void;
}

function DeadlineFormModal({ deadline, onSave, onClose }: DeadlineFormModalProps) {
  const [formData, setFormData] = useState<Partial<ComplianceDeadline>>(
    deadline || {
      title: '',
      description: '',
      framework: 'CUSTOM',
      category: '',
      type: 'other',
      dueDate: new Date().toISOString().split('T')[0],
      reminderDays: [7, 3, 1],
      priority: 'medium',
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal deadline-form-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{deadline ? 'Edit Deadline' : 'Create Deadline'}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            <div className="form-group">
              <label htmlFor="title">Title *</label>
              <input
                id="title"
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="type">Type</label>
                <select
                  id="type"
                  value={formData.type || 'other'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as ComplianceDeadline['type'] })}
                >
                  {Object.entries(DEADLINE_TYPE_ICONS).map(([type, icon]) => (
                    <option key={type} value={type}>{icon} {type}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  value={formData.priority || 'medium'}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as ComplianceDeadline['priority'] })}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="framework">Framework</label>
                <select
                  id="framework"
                  value={formData.framework || 'CUSTOM'}
                  onChange={(e) => setFormData({ ...formData, framework: e.target.value as ComplianceFramework })}
                >
                  {['SOX', 'GDPR', 'ISO27001', 'HIPAA', 'PCI_DSS', 'SOC2', 'CUSTOM'].map((fw) => (
                    <option key={fw} value={fw}>{fw}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="dueDate">Due Date *</label>
                <input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate?.split('T')[0] || ''}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <input
                id="category"
                type="text"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Annual Audit, Quarterly Review"
              />
            </div>
          </div>

          <footer className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {deadline ? 'Update' : 'Create'} Deadline
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default DeadlineManager;
