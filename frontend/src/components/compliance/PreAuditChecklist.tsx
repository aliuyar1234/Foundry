/**
 * Pre-Audit Checklist Component
 * T202 - Interactive checklist for audit preparation
 *
 * Tracks audit preparation tasks and readiness
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework } from 'shared/types/compliance';

// Types
export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'not_applicable';
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  evidence?: Array<{ id: string; name: string; url: string }>;
  dependencies?: string[];
  automatedCheck?: {
    enabled: boolean;
    lastRun?: string;
    lastResult?: 'passed' | 'failed';
  };
}

export interface PreAuditChecklistData {
  id: string;
  name: string;
  description: string;
  framework: ComplianceFramework;
  auditDate: string;
  auditor?: string;
  items: ChecklistItem[];
  progress: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    notApplicable: number;
  };
  readinessScore: number;
  createdAt: string;
  updatedAt: string;
}

interface PreAuditChecklistProps {
  organizationId: string;
  checklistId?: string;
  framework?: ComplianceFramework;
  onComplete?: (checklistId: string) => void;
}

const STATUS_OPTIONS: Array<{ value: ChecklistItem['status']; label: string; icon: string }> = [
  { value: 'not_started', label: 'Not Started', icon: '○' },
  { value: 'in_progress', label: 'In Progress', icon: '◐' },
  { value: 'completed', label: 'Completed', icon: '●' },
  { value: 'blocked', label: 'Blocked', icon: '⊘' },
  { value: 'not_applicable', label: 'N/A', icon: '—' },
];

const PRIORITY_LABELS = {
  critical: { label: 'Critical', color: 'red' },
  high: { label: 'High', color: 'orange' },
  medium: { label: 'Medium', color: 'yellow' },
  low: { label: 'Low', color: 'green' },
};

export function PreAuditChecklist({
  organizationId,
  checklistId,
  framework,
  onComplete,
}: PreAuditChecklistProps) {
  const [checklist, setChecklist] = useState<PreAuditChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChecklistItem['status'] | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchChecklist = useCallback(async () => {
    try {
      setLoading(true);

      let url: string;
      if (checklistId) {
        url = `/api/compliance/checklists/${checklistId}`;
      } else {
        const params = new URLSearchParams({ organizationId });
        if (framework) params.append('framework', framework);
        url = `/api/compliance/checklists/latest?${params}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          setChecklist(null);
          return;
        }
        throw new Error('Failed to fetch checklist');
      }

      const data = await response.json();
      setChecklist(data.checklist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, checklistId, framework]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  const handleCreateChecklist = async (data: Partial<PreAuditChecklistData>) => {
    try {
      const response = await fetch('/api/compliance/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, organizationId }),
      });

      if (!response.ok) throw new Error('Failed to create checklist');

      const result = await response.json();
      setChecklist(result.checklist);
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<ChecklistItem>) => {
    if (!checklist) return;

    try {
      const response = await fetch(
        `/api/compliance/checklists/${checklist.id}/items/${itemId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) throw new Error('Failed to update item');

      await fetchChecklist();
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleStatusChange = async (itemId: string, status: ChecklistItem['status']) => {
    await handleUpdateItem(itemId, {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : undefined,
    });
  };

  const handleRunAutomatedChecks = async () => {
    if (!checklist) return;

    try {
      const response = await fetch(
        `/api/compliance/checklists/${checklist.id}/run-checks`,
        { method: 'POST' }
      );

      if (!response.ok) throw new Error('Failed to run automated checks');

      await fetchChecklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    }
  };

  const handleCompleteChecklist = () => {
    if (checklist) {
      onComplete?.(checklist.id);
    }
  };

  const toggleItemExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // Get unique categories
  const categories = checklist
    ? Array.from(new Set(checklist.items.map((item) => item.category)))
    : [];

  // Filter items
  const filteredItems = checklist?.items.filter((item) => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    return true;
  }) || [];

  // Group items by category
  const groupedItems = filteredItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="pre-audit-checklist loading">
        <div className="spinner" />
        <p>Loading checklist...</p>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="pre-audit-checklist empty">
        <div className="empty-state">
          <h2>No Checklist Found</h2>
          <p>Create a new pre-audit checklist to prepare for your upcoming audit.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Checklist
          </button>
        </div>

        {showCreateModal && (
          <CreateChecklistModal
            framework={framework}
            onSave={handleCreateChecklist}
            onClose={() => setShowCreateModal(false)}
          />
        )}
      </div>
    );
  }

  const readinessClass = checklist.readinessScore >= 90 ? 'excellent' :
    checklist.readinessScore >= 70 ? 'good' :
    checklist.readinessScore >= 50 ? 'fair' : 'poor';

  return (
    <div className="pre-audit-checklist">
      {/* Header */}
      <header className="checklist-header">
        <div className="header-content">
          <h1>{checklist.name}</h1>
          <p className="description">{checklist.description}</p>
          <div className="meta">
            <span className="framework">{checklist.framework}</span>
            <span className="audit-date">
              Audit Date: {new Date(checklist.auditDate).toLocaleDateString()}
            </span>
            {checklist.auditor && (
              <span className="auditor">Auditor: {checklist.auditor}</span>
            )}
          </div>
        </div>

        <div className="header-actions">
          <button
            onClick={handleRunAutomatedChecks}
            className="btn btn-secondary"
          >
            Run Automated Checks
          </button>
          {checklist.progress.completed === checklist.progress.total && (
            <button
              onClick={handleCompleteChecklist}
              className="btn btn-success"
            >
              Mark Complete
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

      {/* Progress Overview */}
      <div className="progress-overview">
        <div className={`readiness-score ${readinessClass}`}>
          <div className="score-circle">
            <span className="score-value">{checklist.readinessScore}%</span>
          </div>
          <span className="score-label">Audit Readiness</span>
        </div>

        <div className="progress-breakdown">
          <div className="progress-bar">
            <div
              className="progress-completed"
              style={{ width: `${(checklist.progress.completed / checklist.progress.total) * 100}%` }}
            />
            <div
              className="progress-in-progress"
              style={{ width: `${(checklist.progress.inProgress / checklist.progress.total) * 100}%` }}
            />
            <div
              className="progress-blocked"
              style={{ width: `${(checklist.progress.blocked / checklist.progress.total) * 100}%` }}
            />
          </div>

          <div className="progress-stats">
            <div className="stat completed">
              <span className="value">{checklist.progress.completed}</span>
              <span className="label">Completed</span>
            </div>
            <div className="stat in-progress">
              <span className="value">{checklist.progress.inProgress}</span>
              <span className="label">In Progress</span>
            </div>
            <div className="stat blocked">
              <span className="value">{checklist.progress.blocked}</span>
              <span className="label">Blocked</span>
            </div>
            <div className="stat total">
              <span className="value">{checklist.progress.total}</span>
              <span className="label">Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="checklist-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ChecklistItem['status'] | 'all')}
          >
            <option value="all">All</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <span className="filter-count">
          Showing {filteredItems.length} of {checklist.items.length} items
        </span>
      </div>

      {/* Checklist Items */}
      <div className="checklist-content">
        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category} className="category-section">
            <h2 className="category-header">
              {category}
              <span className="category-count">
                {items.filter((i) => i.status === 'completed').length}/{items.length}
              </span>
            </h2>

            <div className="items-list">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`checklist-item ${item.status} ${item.priority}`}
                >
                  <div
                    className="item-main"
                    onClick={() => toggleItemExpanded(item.id)}
                  >
                    <div className="item-status">
                      <select
                        value={item.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleStatusChange(item.id, e.target.value as ChecklistItem['status']);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="status-select"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.icon} {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="item-content">
                      <h3 className="item-title">{item.title}</h3>
                      <p className="item-description">{item.description}</p>
                    </div>

                    <div className="item-meta">
                      <span className={`priority-badge ${item.priority}`}>
                        {PRIORITY_LABELS[item.priority].label}
                      </span>
                      {item.dueDate && (
                        <span className={`due-date ${
                          new Date(item.dueDate) < new Date() ? 'overdue' : ''
                        }`}>
                          Due: {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {item.automatedCheck?.enabled && (
                        <span className={`automated-badge ${item.automatedCheck.lastResult || ''}`}>
                          Auto
                        </span>
                      )}
                    </div>

                    <button className="expand-btn">
                      {expandedItems.has(item.id) ? '▼' : '▶'}
                    </button>
                  </div>

                  {expandedItems.has(item.id) && (
                    <div className="item-details">
                      <div className="details-grid">
                        {item.assigneeName && (
                          <div className="detail">
                            <label>Assigned to:</label>
                            <span>{item.assigneeName}</span>
                          </div>
                        )}
                        {item.completedAt && (
                          <div className="detail">
                            <label>Completed:</label>
                            <span>
                              {new Date(item.completedAt).toLocaleString()}
                              {item.completedBy && ` by ${item.completedBy}`}
                            </span>
                          </div>
                        )}
                        {item.dependencies && item.dependencies.length > 0 && (
                          <div className="detail">
                            <label>Dependencies:</label>
                            <span>{item.dependencies.length} items</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <div className="notes">
                          <label>Notes:</label>
                          <p>{item.notes}</p>
                        </div>
                      )}

                      {item.evidence && item.evidence.length > 0 && (
                        <div className="evidence-list">
                          <label>Evidence:</label>
                          <ul>
                            {item.evidence.map((ev) => (
                              <li key={ev.id}>
                                <a href={ev.url} target="_blank" rel="noopener noreferrer">
                                  {ev.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="item-actions">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="btn btn-small"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleUpdateItem(item.id, { notes: '' })}
                          className="btn btn-small btn-secondary"
                        >
                          Add Note
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={(updates) => handleUpdateItem(editingItem.id, updates)}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

// Create Checklist Modal
interface CreateChecklistModalProps {
  framework?: ComplianceFramework;
  onSave: (data: Partial<PreAuditChecklistData>) => void;
  onClose: () => void;
}

function CreateChecklistModal({ framework, onSave, onClose }: CreateChecklistModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    framework: framework || 'SOX' as ComplianceFramework,
    auditDate: '',
    auditor: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-checklist-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Create Pre-Audit Checklist</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            <div className="form-group">
              <label htmlFor="name">Checklist Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="framework">Framework *</label>
                <select
                  id="framework"
                  value={formData.framework}
                  onChange={(e) => setFormData({
                    ...formData,
                    framework: e.target.value as ComplianceFramework,
                  })}
                >
                  {['SOX', 'GDPR', 'ISO27001', 'HIPAA', 'PCI_DSS', 'SOC2'].map((fw) => (
                    <option key={fw} value={fw}>{fw}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="auditDate">Audit Date *</label>
                <input
                  id="auditDate"
                  type="date"
                  value={formData.auditDate}
                  onChange={(e) => setFormData({ ...formData, auditDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="auditor">Auditor Name</label>
              <input
                id="auditor"
                type="text"
                value={formData.auditor}
                onChange={(e) => setFormData({ ...formData, auditor: e.target.value })}
              />
            </div>
          </div>

          <footer className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Checklist
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// Edit Item Modal
interface EditItemModalProps {
  item: ChecklistItem;
  onSave: (updates: Partial<ChecklistItem>) => void;
  onClose: () => void;
}

function EditItemModal({ item, onSave, onClose }: EditItemModalProps) {
  const [formData, setFormData] = useState({
    status: item.status,
    notes: item.notes || '',
    dueDate: item.dueDate?.split('T')[0] || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      status: formData.status,
      notes: formData.notes || undefined,
      dueDate: formData.dueDate || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-item-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Edit Item</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            <h3>{item.title}</h3>
            <p className="item-description">{item.description}</p>

            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({
                  ...formData,
                  status: e.target.value as ChecklistItem['status'],
                })}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dueDate">Due Date</label>
              <input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <footer className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default PreAuditChecklist;
