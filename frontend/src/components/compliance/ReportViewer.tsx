/**
 * Report Viewer Component
 * T201 - View and interact with generated compliance reports
 *
 * Display generated reports with export options
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ComplianceFramework, ComplianceReportType } from 'shared/types/compliance';

// Types
export interface ComplianceReport {
  id: string;
  type: ComplianceReportType;
  title: string;
  description?: string;
  framework?: ComplianceFramework;
  organizationId: string;
  generatedAt: string;
  generatedBy: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  summary: {
    complianceScore: number;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    totalViolations: number;
    criticalViolations: number;
    recommendations: number;
  };
  sections: ReportSection[];
  metadata: {
    version: string;
    exportFormats: string[];
  };
}

export interface ReportSection {
  id: string;
  title: string;
  order: number;
  content: {
    type: 'text' | 'table' | 'chart' | 'list' | 'metrics';
    data: unknown;
  };
}

interface ReportViewerProps {
  reportId: string;
  onClose?: () => void;
  onExport?: (format: string) => void;
}

export function ReportViewer({ reportId, onClose, onExport }: ReportViewerProps) {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/compliance/reports/${reportId}`);
      if (!response.ok) throw new Error('Failed to fetch report');
      const data = await response.json();
      setReport(data.report);
      if (data.report.sections.length > 0) {
        setActiveSection(data.report.sections[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async (format: string) => {
    try {
      setExporting(true);
      const response = await fetch(`/api/compliance/reports/${reportId}/export?format=${format}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report?.title || 'report'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onExport?.(format);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!report) return;

    const shareUrl = `${window.location.origin}/compliance/reports/${report.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: report.title,
          text: `Compliance Report: ${report.title}`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert('Report link copied to clipboard');
    }
  };

  if (loading) {
    return (
      <div className="report-viewer loading">
        <div className="spinner" />
        <p>Loading report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="report-viewer error">
        <p>{error || 'Report not found'}</p>
        <button onClick={onClose} className="btn btn-secondary">
          Close
        </button>
      </div>
    );
  }

  const getScoreClass = (score: number): string => {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  };

  return (
    <div className="report-viewer">
      {/* Header */}
      <header className="report-header">
        <div className="header-content">
          <h1>{report.title}</h1>
          <p className="report-meta">
            <span className="report-type">{report.type.replace('_', ' ')}</span>
            {report.framework && (
              <span className="framework">{report.framework}</span>
            )}
            <span className="generated-date">
              Generated: {new Date(report.generatedAt).toLocaleString()}
            </span>
          </p>
          {report.description && (
            <p className="report-description">{report.description}</p>
          )}
        </div>

        <div className="header-actions">
          <div className="export-dropdown">
            <button className="btn btn-secondary dropdown-trigger" disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="dropdown-menu">
              {report.metadata.exportFormats.map((format) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="dropdown-item"
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handlePrint} className="btn btn-secondary">
            Print
          </button>
          <button onClick={handleShare} className="btn btn-secondary">
            Share
          </button>
          {onClose && (
            <button onClick={onClose} className="btn btn-link">
              Close
            </button>
          )}
        </div>
      </header>

      {/* Summary */}
      <div className="report-summary">
        <div className={`score-display ${getScoreClass(report.summary.complianceScore)}`}>
          <div className="score-circle">
            <span className="score-value">{report.summary.complianceScore}%</span>
          </div>
          <span className="score-label">Compliance Score</span>
        </div>

        <div className="summary-stats">
          <div className="stat">
            <span className="value">{report.summary.passedRules}</span>
            <span className="label">Rules Passed</span>
            <span className="total">of {report.summary.totalRules}</span>
          </div>
          <div className="stat failed">
            <span className="value">{report.summary.failedRules}</span>
            <span className="label">Rules Failed</span>
          </div>
          <div className="stat violations">
            <span className="value">{report.summary.totalViolations}</span>
            <span className="label">Violations</span>
            {report.summary.criticalViolations > 0 && (
              <span className="critical">{report.summary.criticalViolations} critical</span>
            )}
          </div>
          <div className="stat recommendations">
            <span className="value">{report.summary.recommendations}</span>
            <span className="label">Recommendations</span>
          </div>
        </div>

        <div className="date-range">
          <span>Report Period:</span>
          <span className="dates">
            {new Date(report.dateRange.startDate).toLocaleDateString()} - {new Date(report.dateRange.endDate).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="section-navigation">
        <ul className="section-list">
          {report.sections.map((section) => (
            <li
              key={section.id}
              className={activeSection === section.id ? 'active' : ''}
            >
              <button onClick={() => setActiveSection(section.id)}>
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="report-content">
        {report.sections.map((section) => (
          <section
            key={section.id}
            id={`section-${section.id}`}
            className={`report-section ${activeSection === section.id ? 'active' : ''}`}
          >
            <h2>{section.title}</h2>
            <SectionContent content={section.content} />
          </section>
        ))}
      </div>

      {/* Footer */}
      <footer className="report-footer">
        <div className="footer-info">
          <span>Report ID: {report.id}</span>
          <span>Version: {report.metadata.version}</span>
          <span>Generated by: {report.generatedBy}</span>
        </div>
      </footer>
    </div>
  );
}

// Section Content Renderer
interface SectionContentProps {
  content: ReportSection['content'];
}

function SectionContent({ content }: SectionContentProps) {
  switch (content.type) {
    case 'text':
      return <TextContent data={content.data as string | string[]} />;
    case 'table':
      return <TableContent data={content.data as TableData} />;
    case 'chart':
      return <ChartContent data={content.data as ChartData} />;
    case 'list':
      return <ListContent data={content.data as ListData} />;
    case 'metrics':
      return <MetricsContent data={content.data as MetricsData} />;
    default:
      return <pre>{JSON.stringify(content.data, null, 2)}</pre>;
  }
}

// Text Content
function TextContent({ data }: { data: string | string[] }) {
  if (Array.isArray(data)) {
    return (
      <div className="text-content">
        {data.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    );
  }
  return <div className="text-content"><p>{data}</p></div>;
}

// Table Content
interface TableData {
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

function TableContent({ data }: { data: TableData }) {
  return (
    <div className="table-content">
      <table>
        <thead>
          <tr>
            {data.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i}>
              {data.headers.map((header) => (
                <td key={header}>
                  {String(row[header] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Chart Content (placeholder for actual chart library)
interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
  }>;
}

function ChartContent({ data }: { data: ChartData }) {
  // In a real implementation, this would use a chart library like Chart.js or Recharts
  return (
    <div className="chart-content">
      <div className="chart-placeholder">
        <p>Chart: {data.type}</p>
        <div className="chart-data">
          {data.labels.map((label, i) => (
            <div key={label} className="chart-item">
              <span className="label">{label}</span>
              <div className="values">
                {data.datasets.map((dataset) => (
                  <span key={dataset.label} className="value">
                    {dataset.label}: {dataset.data[i]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// List Content
interface ListData {
  items: Array<{
    title: string;
    description?: string;
    status?: string;
    priority?: string;
  }>;
  ordered?: boolean;
}

function ListContent({ data }: { data: ListData }) {
  const ListTag = data.ordered ? 'ol' : 'ul';

  return (
    <div className="list-content">
      <ListTag>
        {data.items.map((item, i) => (
          <li key={i} className={`${item.status || ''} ${item.priority || ''}`}>
            <strong>{item.title}</strong>
            {item.description && <p>{item.description}</p>}
            {item.status && <span className="status-badge">{item.status}</span>}
            {item.priority && <span className="priority-badge">{item.priority}</span>}
          </li>
        ))}
      </ListTag>
    </div>
  );
}

// Metrics Content
interface MetricsData {
  metrics: Array<{
    name: string;
    value: number | string;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    change?: number;
  }>;
}

function MetricsContent({ data }: { data: MetricsData }) {
  return (
    <div className="metrics-content">
      <div className="metrics-grid">
        {data.metrics.map((metric) => (
          <div key={metric.name} className="metric-card">
            <span className="metric-name">{metric.name}</span>
            <span className="metric-value">
              {metric.value}
              {metric.unit && <span className="unit">{metric.unit}</span>}
            </span>
            {metric.trend && (
              <span className={`metric-trend ${metric.trend}`}>
                {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                {metric.change !== undefined && ` ${Math.abs(metric.change)}%`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Report List Component for browsing reports
interface ReportListProps {
  organizationId: string;
  framework?: ComplianceFramework;
  onReportSelect: (reportId: string) => void;
}

export function ReportList({ organizationId, framework, onReportSelect }: ReportListProps) {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ organizationId });
        if (framework) params.append('framework', framework);

        const response = await fetch(`/api/compliance/reports?${params}`);
        if (!response.ok) throw new Error('Failed to fetch reports');
        const data = await response.json();
        setReports(data.reports);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [organizationId, framework]);

  if (loading) {
    return <div className="report-list loading"><div className="spinner" /></div>;
  }

  if (error) {
    return <div className="report-list error"><p>{error}</p></div>;
  }

  return (
    <div className="report-list">
      {reports.length === 0 ? (
        <div className="empty-state">
          <p>No reports generated yet.</p>
        </div>
      ) : (
        <div className="reports-grid">
          {reports.map((report) => (
            <div
              key={report.id}
              className="report-card"
              onClick={() => onReportSelect(report.id)}
            >
              <div className="card-header">
                <span className="report-type">{report.type.replace('_', ' ')}</span>
                <span className={`score ${report.summary.complianceScore >= 70 ? 'good' : 'poor'}`}>
                  {report.summary.complianceScore}%
                </span>
              </div>
              <h3>{report.title}</h3>
              <p className="date">
                {new Date(report.generatedAt).toLocaleDateString()}
              </p>
              {report.framework && (
                <span className="framework-badge">{report.framework}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReportViewer;
