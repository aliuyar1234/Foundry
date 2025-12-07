/**
 * SQL Export Options Component
 * Configuration options for SQL export (PostgreSQL, MySQL, SQL Server, SQLite)
 * T277 - SQL export options implementation
 */

import React, { useState } from 'react';
import { useSqlExport, SqlDialect } from '../../hooks/usePreparation';

interface SqlExportOptionsProps {
  organizationId: string;
  entityTypes: string[];
  onClose: () => void;
  onExport: (options: SqlExportConfig) => void;
}

export interface SqlExportConfig {
  dialect: SqlDialect;
  schema?: string;
  includeCreateTable: boolean;
  includeTruncate: boolean;
  batchSize: number;
  includeMetadata: boolean;
}

const DIALECT_OPTIONS: { value: SqlDialect; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'postgresql',
    label: 'PostgreSQL',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
      </svg>
    ),
    description: 'Open-source relational database',
  },
  {
    value: 'mysql',
    label: 'MySQL',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    description: 'Popular MySQL/MariaDB database',
  },
  {
    value: 'sqlserver',
    label: 'SQL Server',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z"/>
      </svg>
    ),
    description: 'Microsoft SQL Server',
  },
  {
    value: 'sqlite',
    label: 'SQLite',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/>
      </svg>
    ),
    description: 'Lightweight embedded database',
  },
];

export function SqlExportOptions({
  organizationId,
  entityTypes,
  onClose,
  onExport,
}: SqlExportOptionsProps) {
  const [config, setConfig] = useState<SqlExportConfig>({
    dialect: 'postgresql',
    schema: '',
    includeCreateTable: true,
    includeTruncate: false,
    batchSize: 100,
    includeMetadata: false,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewSql, setPreviewSql] = useState<string | null>(null);

  const sqlExport = useSqlExport(organizationId);

  const handlePreview = async () => {
    try {
      const result = await sqlExport.mutateAsync({
        dialect: config.dialect,
        entityTypes,
        schema: config.schema || undefined,
        includeCreateTable: config.includeCreateTable,
        includeTruncate: config.includeTruncate,
        batchSize: config.batchSize,
        includeMetadata: config.includeMetadata,
        preview: true,
        limit: 5,
      });

      if (result.statements) {
        setPreviewSql(result.statements.slice(0, 10).join('\n\n'));
      }
    } catch (error) {
      console.error('Preview failed:', error);
    }
  };

  const handleExport = () => {
    onExport(config);
  };

  const dialectInfo = DIALECT_OPTIONS.find((d) => d.value === config.dialect);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">SQL Export Options</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Configure SQL export for {entityTypes.length} entity types
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 overflow-y-auto max-h-[60vh]">
            {/* Dialect Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Database Dialect
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {DIALECT_OPTIONS.map((dialect) => (
                  <button
                    key={dialect.value}
                    onClick={() => setConfig({ ...config, dialect: dialect.value })}
                    className={`p-4 rounded-lg border-2 text-center transition-colors ${
                      config.dialect === dialect.value
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className={`mx-auto mb-2 ${
                      config.dialect === dialect.value ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {dialect.icon}
                    </div>
                    <div className="font-medium text-gray-900 text-sm">{dialect.label}</div>
                  </button>
                ))}
              </div>
              {dialectInfo && (
                <p className="text-sm text-gray-500 mt-2">{dialectInfo.description}</p>
              )}
            </div>

            {/* Basic Options */}
            <div className="space-y-4 mb-6">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeCreateTable}
                  onChange={(e) => setConfig({ ...config, includeCreateTable: e.target.checked })}
                  className="mt-0.5 rounded border-gray-300 text-emerald-600"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Include CREATE TABLE</div>
                  <div className="text-xs text-gray-500">
                    Generate table creation statements before INSERT
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeTruncate}
                  onChange={(e) => setConfig({ ...config, includeTruncate: e.target.checked })}
                  className="mt-0.5 rounded border-gray-300 text-emerald-600"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Include TRUNCATE</div>
                  <div className="text-xs text-gray-500">
                    Clear existing data before importing (use with caution)
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeMetadata}
                  onChange={(e) => setConfig({ ...config, includeMetadata: e.target.checked })}
                  className="mt-0.5 rounded border-gray-300 text-emerald-600"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Include Metadata</div>
                  <div className="text-xs text-gray-500">
                    Add source record IDs and export timestamp comments
                  </div>
                </div>
              </label>
            </div>

            {/* Advanced Options Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced Options
            </button>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schema Name (optional)
                  </label>
                  <input
                    type="text"
                    value={config.schema}
                    onChange={(e) => setConfig({ ...config, schema: e.target.value })}
                    placeholder="e.g., public, dbo"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Prefix tables with schema name
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Size
                  </label>
                  <select
                    value={config.batchSize}
                    onChange={(e) => setConfig({ ...config, batchSize: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={50}>50 records per INSERT</option>
                    <option value={100}>100 records per INSERT</option>
                    <option value={250}>250 records per INSERT</option>
                    <option value={500}>500 records per INSERT</option>
                    <option value={1000}>1000 records per INSERT</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Number of records per INSERT statement (affects performance)
                  </p>
                </div>
              </div>
            )}

            {/* SQL Preview */}
            {previewSql && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">SQL Preview</label>
                  <button
                    onClick={() => setPreviewSql(null)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear preview
                  </button>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-auto">
                  <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                    {previewSql}
                  </pre>
                </div>
              </div>
            )}

            {/* Dialect-specific Info */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-900">
                    {dialectInfo?.label} Specific Features
                  </h4>
                  <p className="text-xs text-blue-700 mt-1">
                    {config.dialect === 'postgresql' && 'Uses ON CONFLICT DO NOTHING for upsert support and JSONB for complex fields.'}
                    {config.dialect === 'mysql' && 'Uses INSERT IGNORE for duplicate handling and backtick quotes for identifiers.'}
                    {config.dialect === 'sqlserver' && 'Uses standard T-SQL syntax with double-quote identifiers.'}
                    {config.dialect === 'sqlite' && 'Uses INSERT OR IGNORE for conflict handling, compatible with SQLite 3.x.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Output format: .sql ({config.dialect})
            </div>
            <div className="flex gap-3">
              <button
                onClick={handlePreview}
                disabled={sqlExport.isPending}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {sqlExport.isPending ? 'Generating...' : 'Preview SQL'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export SQL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SqlExportOptions;
