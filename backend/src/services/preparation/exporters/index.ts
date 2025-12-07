/**
 * ERP Exporters Index
 * Export entity records to various ERP system formats
 */

export {
  exportToSAPB1,
  type SAPB1ExportOptions,
  type SAPB1ExportResult,
  type SAPB1BusinessPartner,
  type SAPB1Item,
  type SAPB1Address,
  type SAPB1ContactPerson,
} from './sapB1Exporter.js';

export {
  exportToOdoo,
  type OdooExportOptions,
  type OdooExportResult,
  type OdooPartner,
  type OdooProduct,
  type OdooAddress,
} from './odooExporter.js';

export {
  exportToDynamics365,
  type Dynamics365ExportOptions,
  type Dynamics365ExportResult,
  type Dynamics365Account,
  type Dynamics365Contact,
  type Dynamics365Product,
  type Dynamics365Address,
} from './dynamics365Exporter.js';

export {
  exportToSql,
  toSqlString,
  getSupportedDialects,
  getDefaultTableMappings,
  getDefaultColumnMappings,
  type SqlDialect,
  type SqlExportOptions,
  type SqlExportResult,
} from './sqlExporter.js';

export {
  validateExport,
  getValidationRules,
  createValidationRule,
  getSupportedTargets,
  formatValidationReport,
  type ValidationRule,
  type ValidationResult,
  type ValidationIssue,
  type ExportTarget,
} from './exportValidator.js';

export {
  generateExportPreview,
  formatPreviewAsTable,
  getTargetFieldMappings,
  type ExportPreviewOptions,
  type ExportPreview,
  type FieldPreview,
  type EntityPreview,
} from './exportPreview.js';

// Export format type
export type ExportFormat = 'sap_b1' | 'odoo' | 'dynamics_365' | 'sql' | 'csv';

// Common export options
export interface BaseExportOptions {
  includeMetadata?: boolean;
}

// Export result base type
export interface BaseExportResult {
  format: ExportFormat;
  version: string;
  recordCount: number;
  exportedAt: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}
