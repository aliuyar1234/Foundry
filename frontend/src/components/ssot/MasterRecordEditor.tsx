/**
 * Master Record Editor Component
 * CRUD interface for master records
 * T291 - Master record editor
 */

import React, { useState, useEffect, useCallback } from 'react';

interface MasterRecord {
  id: string;
  organizationId: string;
  entityType: string;
  externalId?: string;
  data: Record<string, unknown>;
  metadata: {
    createdBy: string;
    lastModifiedBy: string;
    tags: string[];
    custom: Record<string, unknown>;
  };
  status: 'active' | 'pending' | 'archived' | 'deleted';
  version: number;
  qualityScore: number;
  sources: RecordSource[];
  createdAt: string;
  updatedAt: string;
}

interface RecordSource {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  externalId: string;
  lastSyncedAt: string;
  syncStatus: 'synced' | 'pending' | 'error';
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; severity: string }>;
  warnings: Array<{ field: string; message: string }>;
}

interface MasterRecordEditorProps {
  organizationId: string;
  initialEntityType?: string;
  onRecordChange?: () => void;
}

const ENTITY_FIELDS: Record<string, Array<{ name: string; label: string; type: string; required?: boolean }>> = {
  company: [
    { name: 'name', label: 'Company Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'website', label: 'Website', type: 'url' },
    { name: 'industry', label: 'Industry', type: 'text' },
    { name: 'address', label: 'Address', type: 'textarea' },
  ],
  person: [
    { name: 'firstName', label: 'First Name', type: 'text', required: true },
    { name: 'lastName', label: 'Last Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'jobTitle', label: 'Job Title', type: 'text' },
    { name: 'department', label: 'Department', type: 'text' },
  ],
  product: [
    { name: 'name', label: 'Product Name', type: 'text', required: true },
    { name: 'sku', label: 'SKU', type: 'text', required: true },
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'category', label: 'Category', type: 'text' },
    { name: 'description', label: 'Description', type: 'textarea' },
  ],
  address: [
    { name: 'street', label: 'Street', type: 'text', required: true },
    { name: 'city', label: 'City', type: 'text', required: true },
    { name: 'postalCode', label: 'Postal Code', type: 'text', required: true },
    { name: 'country', label: 'Country', type: 'text', required: true },
    { name: 'state', label: 'State/Region', type: 'text' },
  ],
  contact: [
    { name: 'type', label: 'Contact Type', type: 'select' },
    { name: 'value', label: 'Value', type: 'text', required: true },
    { name: 'isPrimary', label: 'Primary Contact', type: 'checkbox' },
  ],
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  pending: '#f97316',
  archived: '#6b7280',
  deleted: '#ef4444',
};

export const MasterRecordEditor: React.FC<MasterRecordEditorProps> = ({
  organizationId,
  initialEntityType,
  onRecordChange,
}) => {
  const [records, setRecords] = useState<MasterRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MasterRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityType, setEntityType] = useState(initialEntityType || 'company');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        entityType,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/v1/ssot/records?${params}`);
      if (!response.ok) throw new Error('Failed to fetch records');

      const data = await response.json();
      setRecords(data.records);
      setTotal(data.total);
    } catch (error) {
      console.error('Error fetching records:', error);
    } finally {
      setLoading(false);
    }
  }, [entityType, page, searchQuery]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSelectRecord = async (record: MasterRecord) => {
    setSelectedRecord(record);
    setFormData(record.data);
    setIsEditing(false);
    setValidation(null);
  };

  const handleCreate = () => {
    setSelectedRecord(null);
    setFormData({});
    setIsCreating(true);
    setIsEditing(true);
    setValidation(null);
  };

  const handleEdit = () => {
    if (selectedRecord) {
      setFormData(selectedRecord.data);
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
    }
    setIsEditing(false);
    if (selectedRecord) {
      setFormData(selectedRecord.data);
    }
    setValidation(null);
  };

  const validateForm = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/v1/ssot/validation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, data: formData }),
      });

      const result = await response.json();
      setValidation(result);
      return result.valid;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  };

  const handleSave = async () => {
    const isValid = await validateForm();
    if (!isValid) return;

    try {
      setLoading(true);

      if (isCreating) {
        const response = await fetch('/api/v1/ssot/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType,
            data: formData,
          }),
        });

        if (!response.ok) throw new Error('Failed to create record');

        const data = await response.json();
        setSelectedRecord(data.record);
        setIsCreating(false);
      } else if (selectedRecord) {
        const response = await fetch(`/api/v1/ssot/records/${selectedRecord.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: formData }),
        });

        if (!response.ok) throw new Error('Failed to update record');

        const updatedRecord = await response.json();
        setSelectedRecord(updatedRecord);
      }

      setIsEditing(false);
      fetchRecords();
      onRecordChange?.();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRecord) return;

    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/v1/ssot/records/${selectedRecord.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete record');

      setSelectedRecord(null);
      fetchRecords();
      onRecordChange?.();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const fields = ENTITY_FIELDS[entityType] || [];

  return (
    <div className="master-record-editor">
      <style>{styles}</style>

      {/* Left Panel - Record List */}
      <div className="list-panel">
        <div className="list-header">
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setSelectedRecord(null);
              setPage(0);
            }}
            className="entity-select"
          >
            <option value="company">Companies</option>
            <option value="person">People</option>
            <option value="product">Products</option>
            <option value="address">Addresses</option>
            <option value="contact">Contacts</option>
          </select>
          <button onClick={handleCreate} className="create-btn">
            + New
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>

        {loading && <div className="loading-indicator">Loading...</div>}

        <div className="record-list">
          {records.map((record) => (
            <div
              key={record.id}
              className={`record-item ${selectedRecord?.id === record.id ? 'selected' : ''}`}
              onClick={() => handleSelectRecord(record)}
            >
              <div className="record-main">
                <span className="record-title">
                  {String(record.data.name || record.data.firstName || record.data.sku || record.id.slice(0, 8))}
                </span>
                <span className="record-subtitle">
                  {record.externalId || `v${record.version}`}
                </span>
              </div>
              <div className="record-meta">
                <span
                  className="status-badge"
                  style={{ backgroundColor: STATUS_COLORS[record.status] }}
                >
                  {record.status}
                </span>
                <span className="quality-score">{record.qualityScore}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
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
      </div>

      {/* Right Panel - Record Detail/Editor */}
      <div className="detail-panel">
        {(selectedRecord || isCreating) ? (
          <>
            <div className="detail-header">
              <h2>{isCreating ? 'New Record' : 'Record Details'}</h2>
              <div className="detail-actions">
                {isEditing ? (
                  <>
                    <button onClick={handleCancel} className="cancel-btn">
                      Cancel
                    </button>
                    <button onClick={handleSave} className="save-btn" disabled={loading}>
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleEdit} className="edit-btn">
                      Edit
                    </button>
                    <button onClick={handleDelete} className="delete-btn">
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Validation Messages */}
            {validation && !validation.valid && (
              <div className="validation-errors">
                {validation.errors.map((err, idx) => (
                  <div key={idx} className="error-message">
                    <strong>{err.field}:</strong> {err.message}
                  </div>
                ))}
              </div>
            )}

            {validation?.warnings && validation.warnings.length > 0 && (
              <div className="validation-warnings">
                {validation.warnings.map((warn, idx) => (
                  <div key={idx} className="warning-message">
                    <strong>{warn.field}:</strong> {warn.message}
                  </div>
                ))}
              </div>
            )}

            {/* Form Fields */}
            <div className="form-fields">
              {fields.map((field) => (
                <div key={field.name} className="form-group">
                  <label>
                    {field.label}
                    {field.required && <span className="required">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={String(formData[field.name] || '')}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      disabled={!isEditing}
                      rows={3}
                    />
                  ) : field.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(formData[field.name])}
                      onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                      disabled={!isEditing}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={String(formData[field.name] || '')}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      disabled={!isEditing}
                    >
                      <option value="">Select...</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="mobile">Mobile</option>
                      <option value="fax">Fax</option>
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={String(formData[field.name] || '')}
                      onChange={(e) =>
                        handleFieldChange(
                          field.name,
                          field.type === 'number' ? parseFloat(e.target.value) : e.target.value
                        )
                      }
                      disabled={!isEditing}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Record Metadata */}
            {selectedRecord && !isCreating && (
              <div className="record-metadata">
                <h3>Record Information</h3>
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">ID</span>
                    <span className="metadata-value">{selectedRecord.id}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Version</span>
                    <span className="metadata-value">{selectedRecord.version}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Quality Score</span>
                    <span className="metadata-value">{selectedRecord.qualityScore}%</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Created</span>
                    <span className="metadata-value">
                      {new Date(selectedRecord.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Updated</span>
                    <span className="metadata-value">
                      {new Date(selectedRecord.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Created By</span>
                    <span className="metadata-value">{selectedRecord.metadata.createdBy}</span>
                  </div>
                </div>

                {/* Sources */}
                {selectedRecord.sources.length > 0 && (
                  <div className="sources-section">
                    <h4>Connected Sources</h4>
                    <div className="sources-list">
                      {selectedRecord.sources.map((source, idx) => (
                        <div key={idx} className="source-item">
                          <span className="source-name">{source.sourceName}</span>
                          <span className="source-id">{source.externalId}</span>
                          <span className={`sync-status ${source.syncStatus}`}>
                            {source.syncStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Version History Link */}
                <div className="history-link">
                  <button className="view-history-btn">
                    View Version History
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-detail">
            <p>Select a record to view details or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = `
  .master-record-editor {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 24px;
    min-height: 600px;
  }

  .list-panel {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
  }

  .list-header {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .entity-select {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
  }

  .create-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
  }

  .search-box {
    padding: 12px 16px;
  }

  .search-box input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .loading-indicator {
    text-align: center;
    padding: 16px;
    color: #6b7280;
  }

  .record-list {
    flex: 1;
    overflow-y: auto;
  }

  .record-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background 0.2s;
  }

  .record-item:hover {
    background: #f9fafb;
  }

  .record-item.selected {
    background: #dbeafe;
    border-left: 3px solid #3b82f6;
  }

  .record-main {
    flex: 1;
    min-width: 0;
  }

  .record-title {
    display: block;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .record-subtitle {
    display: block;
    font-size: 12px;
    color: #9ca3af;
  }

  .record-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    color: white;
    text-transform: uppercase;
  }

  .quality-score {
    font-size: 12px;
    color: #6b7280;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
    color: #6b7280;
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

  .detail-panel {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    padding: 24px;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .detail-header h2 {
    margin: 0;
    font-size: 20px;
    color: #111827;
  }

  .detail-actions {
    display: flex;
    gap: 12px;
  }

  .edit-btn, .save-btn, .cancel-btn, .delete-btn {
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    border: none;
  }

  .edit-btn {
    background: #3b82f6;
    color: white;
  }

  .save-btn {
    background: #22c55e;
    color: white;
  }

  .cancel-btn {
    background: #f3f4f6;
    color: #374151;
  }

  .delete-btn {
    background: #fee2e2;
    color: #ef4444;
  }

  .validation-errors {
    background: #fee2e2;
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .error-message {
    color: #991b1b;
    font-size: 14px;
    margin-bottom: 4px;
  }

  .validation-warnings {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .warning-message {
    color: #92400e;
    font-size: 14px;
    margin-bottom: 4px;
  }

  .form-fields {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .required {
    color: #ef4444;
    margin-left: 4px;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background: #f9fafb;
    color: #6b7280;
  }

  .form-group input[type="checkbox"] {
    width: auto;
  }

  .record-metadata {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  }

  .record-metadata h3 {
    margin: 0 0 16px;
    font-size: 16px;
    color: #374151;
  }

  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .metadata-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metadata-label {
    font-size: 12px;
    color: #9ca3af;
  }

  .metadata-value {
    font-size: 14px;
    color: #374151;
    word-break: break-all;
  }

  .sources-section {
    margin-top: 24px;
  }

  .sources-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #374151;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .source-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: #f9fafb;
    border-radius: 8px;
  }

  .source-name {
    font-weight: 500;
    color: #374151;
  }

  .source-id {
    flex: 1;
    font-size: 12px;
    color: #6b7280;
  }

  .sync-status {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .sync-status.synced {
    background: #dcfce7;
    color: #166534;
  }

  .sync-status.pending {
    background: #fef3c7;
    color: #92400e;
  }

  .sync-status.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .history-link {
    margin-top: 24px;
  }

  .view-history-btn {
    background: none;
    border: 1px solid #e5e7eb;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    color: #3b82f6;
  }

  .empty-detail {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    .master-record-editor {
      grid-template-columns: 1fr;
    }

    .form-fields, .metadata-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default MasterRecordEditor;
