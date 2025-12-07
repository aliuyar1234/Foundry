/**
 * Export Preview Service
 * Generates previews of export data before final export
 * T274 - Export preview implementation
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';
import { validateExport, ValidationResult, ExportTarget } from './exportValidator.js';

export interface ExportPreviewOptions {
  target: ExportTarget;
  sampleSize?: number;
  includeValidation?: boolean;
  includeFieldMapping?: boolean;
  includeStatistics?: boolean;
  format?: 'json' | 'table' | 'summary';
}

export interface FieldPreview {
  sourceField: string;
  targetField: string;
  sampleValues: any[];
  uniqueValues: number;
  nullCount: number;
  dataType: string;
  minLength?: number;
  maxLength?: number;
}

export interface EntityPreview {
  entityType: EntityType;
  recordCount: number;
  sampleRecords: Record<string, any>[];
  fields: FieldPreview[];
  validation?: ValidationResult;
}

export interface ExportPreview {
  target: ExportTarget;
  totalRecords: number;
  entities: EntityPreview[];
  validation?: ValidationResult;
  statistics: ExportStatistics;
  generatedAt: string;
}

export interface ExportStatistics {
  recordsByType: Record<string, number>;
  fieldCoverage: Record<string, number>;
  dataQuality: {
    completeness: number;
    uniqueness: number;
    validity: number;
  };
  estimatedFileSize: number;
}

// Target field mappings for preview
const TARGET_FIELD_MAPPINGS: Record<ExportTarget, Record<EntityType, Record<string, string>>> = {
  sap_b1: {
    company: {
      id: 'CardCode',
      name: 'CardName',
      email: 'E_Mail',
      phone: 'Phone1',
      vatId: 'FederalTaxID',
      street: 'BillToStreet',
      city: 'BillToCity',
      postalCode: 'BillToZipCode',
      country: 'BillToCountry',
    },
    person: {
      id: 'ContactCode',
      firstName: 'FirstName',
      lastName: 'LastName',
      email: 'E_Mail',
      phone: 'Phone1',
      mobile: 'MobilePhone',
      position: 'Position',
    },
    product: {
      id: 'ItemCode',
      name: 'ItemName',
      sku: 'SuppCatNum',
      ean: 'BarCode',
      price: 'Price',
      unit: 'SalesUnit',
    },
    address: {},
    contact: {},
    invoice: {},
    order: {},
    contract: {},
    project: {},
    document: {},
  },
  odoo: {
    company: {
      id: 'id',
      name: 'name',
      email: 'email',
      phone: 'phone',
      website: 'website',
      vatId: 'vat',
      street: 'street',
      city: 'city',
      postalCode: 'zip',
      country: 'country_id',
    },
    person: {
      id: 'id',
      name: 'name',
      email: 'email',
      phone: 'phone',
      mobile: 'mobile',
      jobTitle: 'function',
    },
    product: {
      id: 'default_code',
      name: 'name',
      description: 'description',
      price: 'list_price',
      ean: 'barcode',
    },
    address: {},
    contact: {},
    invoice: {},
    order: {},
    contract: {},
    project: {},
    document: {},
  },
  dynamics_365: {
    company: {
      id: 'accountnumber',
      name: 'name',
      email: 'emailaddress1',
      phone: 'telephone1',
      website: 'websiteurl',
      street: 'address1_line1',
      city: 'address1_city',
      postalCode: 'address1_postalcode',
      country: 'address1_country',
    },
    person: {
      firstName: 'firstname',
      lastName: 'lastname',
      email: 'emailaddress1',
      phone: 'telephone1',
      mobile: 'mobilephone',
      jobTitle: 'jobtitle',
    },
    product: {
      id: 'productnumber',
      name: 'name',
      description: 'description',
      price: 'price',
    },
    address: {},
    contact: {},
    invoice: {},
    order: {},
    contract: {},
    project: {},
    document: {},
  },
  sql: {
    company: { id: 'id', name: 'company_name', email: 'email', phone: 'phone' },
    person: { id: 'id', firstName: 'first_name', lastName: 'last_name', email: 'email' },
    product: { id: 'id', name: 'product_name', sku: 'sku', price: 'price' },
    address: {},
    contact: {},
    invoice: {},
    order: {},
    contract: {},
    project: {},
    document: {},
  },
  csv: {
    company: { id: 'ID', name: 'Company Name', email: 'Email', phone: 'Phone' },
    person: { id: 'ID', firstName: 'First Name', lastName: 'Last Name', email: 'Email' },
    product: { id: 'ID', name: 'Product Name', sku: 'SKU', price: 'Price' },
    address: {},
    contact: {},
    invoice: {},
    order: {},
    contract: {},
    project: {},
    document: {},
  },
  bpmn: {},
};

/**
 * Detect data type from values
 */
function detectDataType(values: any[]): string {
  const nonNullValues = values.filter((v) => v !== null && v !== undefined);
  if (nonNullValues.length === 0) return 'unknown';

  const sample = nonNullValues[0];

  if (typeof sample === 'number') {
    return Number.isInteger(sample) ? 'integer' : 'decimal';
  }
  if (typeof sample === 'boolean') return 'boolean';
  if (sample instanceof Date) return 'datetime';
  if (typeof sample === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return 'datetime';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample)) return 'email';
    if (/^https?:\/\//.test(sample)) return 'url';
    if (/^\+?\d[\d\s()-]+$/.test(sample)) return 'phone';
    return 'string';
  }
  if (typeof sample === 'object') return 'object';

  return 'unknown';
}

/**
 * Generate field preview information
 */
function generateFieldPreview(
  records: EntityRecord[],
  field: string,
  targetField: string,
  sampleSize: number
): FieldPreview {
  const values = records.map((r) => {
    const data = { ...r, ...r.data, ...r.normalizedData };
    return data[field];
  });

  const nonNullValues = values.filter((v) => v !== null && v !== undefined);
  const uniqueValues = new Set(nonNullValues.map((v) => JSON.stringify(v)));

  let minLength: number | undefined;
  let maxLength: number | undefined;

  if (nonNullValues.length > 0 && typeof nonNullValues[0] === 'string') {
    const lengths = nonNullValues.map((v) => String(v).length);
    minLength = Math.min(...lengths);
    maxLength = Math.max(...lengths);
  }

  return {
    sourceField: field,
    targetField,
    sampleValues: values.slice(0, sampleSize),
    uniqueValues: uniqueValues.size,
    nullCount: values.length - nonNullValues.length,
    dataType: detectDataType(nonNullValues),
    minLength,
    maxLength,
  };
}

/**
 * Calculate data quality metrics
 */
function calculateDataQuality(
  records: EntityRecord[],
  requiredFields: string[]
): ExportStatistics['dataQuality'] {
  let totalFields = 0;
  let filledFields = 0;
  let validFields = 0;

  const allIds = new Set<string>();
  let duplicateIds = 0;

  for (const record of records) {
    const data = { ...record, ...record.data, ...record.normalizedData };

    // Track duplicates
    if (allIds.has(record.externalId || record.id)) {
      duplicateIds++;
    } else {
      allIds.add(record.externalId || record.id);
    }

    // Check completeness
    for (const field of requiredFields) {
      totalFields++;
      const value = data[field];
      if (value !== null && value !== undefined && value !== '') {
        filledFields++;
        validFields++;
      }
    }
  }

  return {
    completeness: totalFields > 0 ? (filledFields / totalFields) * 100 : 100,
    uniqueness: records.length > 0 ? ((records.length - duplicateIds) / records.length) * 100 : 100,
    validity: totalFields > 0 ? (validFields / totalFields) * 100 : 100,
  };
}

/**
 * Estimate export file size
 */
function estimateFileSize(records: EntityRecord[], target: ExportTarget): number {
  // Rough estimation based on average record size
  let avgRecordSize = 500; // bytes

  switch (target) {
    case 'sap_b1':
      avgRecordSize = 800; // XML is verbose
      break;
    case 'odoo':
      avgRecordSize = 600;
      break;
    case 'dynamics_365':
      avgRecordSize = 700;
      break;
    case 'sql':
      avgRecordSize = 400;
      break;
    case 'csv':
      avgRecordSize = 300;
      break;
  }

  return records.length * avgRecordSize;
}

/**
 * Generate export preview
 */
export async function generateExportPreview(
  records: EntityRecord[],
  options: ExportPreviewOptions
): Promise<ExportPreview> {
  const { target, sampleSize = 5, includeValidation = true, includeStatistics = true } = options;

  // Group records by entity type
  const byType = records.reduce(
    (acc, record) => {
      if (!acc[record.entityType]) {
        acc[record.entityType] = [];
      }
      acc[record.entityType].push(record);
      return acc;
    },
    {} as Record<EntityType, EntityRecord[]>
  );

  const entities: EntityPreview[] = [];
  const recordsByType: Record<string, number> = {};
  const fieldCoverage: Record<string, number> = {};

  for (const [entityType, typeRecords] of Object.entries(byType)) {
    const type = entityType as EntityType;
    recordsByType[type] = typeRecords.length;

    const fieldMappings = TARGET_FIELD_MAPPINGS[target]?.[type] || {};
    const fields: FieldPreview[] = [];

    // Generate field previews
    for (const [sourceField, targetField] of Object.entries(fieldMappings)) {
      const preview = generateFieldPreview(typeRecords, sourceField, targetField, sampleSize);
      fields.push(preview);

      // Calculate field coverage
      const coverage = ((typeRecords.length - preview.nullCount) / typeRecords.length) * 100;
      fieldCoverage[`${type}.${sourceField}`] = coverage;
    }

    // Get sample records transformed to target format
    const sampleRecords = typeRecords.slice(0, sampleSize).map((record) => {
      const data = { ...record, ...record.data, ...record.normalizedData };
      const transformed: Record<string, any> = {};

      for (const [source, target] of Object.entries(fieldMappings)) {
        transformed[target] = data[source];
      }

      return transformed;
    });

    // Validate entity type if requested
    let validation: ValidationResult | undefined;
    if (includeValidation) {
      validation = await validateExport(typeRecords.slice(0, 100), target);
    }

    entities.push({
      entityType: type,
      recordCount: typeRecords.length,
      sampleRecords,
      fields,
      validation,
    });
  }

  // Overall validation
  let overallValidation: ValidationResult | undefined;
  if (includeValidation) {
    overallValidation = await validateExport(records, target);
  }

  // Calculate statistics
  const requiredFields = ['id', 'name', 'email'];
  const statistics: ExportStatistics = {
    recordsByType,
    fieldCoverage,
    dataQuality: includeStatistics ? calculateDataQuality(records, requiredFields) : { completeness: 0, uniqueness: 0, validity: 0 },
    estimatedFileSize: estimateFileSize(records, target),
  };

  return {
    target,
    totalRecords: records.length,
    entities,
    validation: overallValidation,
    statistics,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Format preview as table (for CLI or logging)
 */
export function formatPreviewAsTable(preview: ExportPreview): string {
  const lines: string[] = [
    `=== Export Preview for ${preview.target} ===`,
    `Total records: ${preview.totalRecords}`,
    `Estimated size: ${formatBytes(preview.statistics.estimatedFileSize)}`,
    '',
  ];

  for (const entity of preview.entities) {
    lines.push(`--- ${entity.entityType} (${entity.recordCount} records) ---`);

    if (entity.fields.length > 0) {
      lines.push('Fields:');
      lines.push('  Source → Target | Type | Coverage | Sample');
      lines.push('  ' + '-'.repeat(60));

      for (const field of entity.fields) {
        const coverage = ((entity.recordCount - field.nullCount) / entity.recordCount * 100).toFixed(0);
        const sample = field.sampleValues[0] ?? 'null';
        lines.push(`  ${field.sourceField} → ${field.targetField} | ${field.dataType} | ${coverage}% | ${sample}`);
      }
    }

    if (entity.validation) {
      lines.push(`  Validation: ${entity.validation.valid ? '✓ PASS' : '✗ FAIL'}`);
      if (!entity.validation.valid) {
        lines.push(`  Errors: ${entity.validation.summary.totalErrors}`);
      }
    }

    lines.push('');
  }

  lines.push('Data Quality:');
  lines.push(`  Completeness: ${preview.statistics.dataQuality.completeness.toFixed(1)}%`);
  lines.push(`  Uniqueness: ${preview.statistics.dataQuality.uniqueness.toFixed(1)}%`);
  lines.push(`  Validity: ${preview.statistics.dataQuality.validity.toFixed(1)}%`);

  return lines.join('\n');
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get target field mappings
 */
export function getTargetFieldMappings(
  target: ExportTarget,
  entityType?: EntityType
): Record<string, string> | Record<EntityType, Record<string, string>> {
  if (entityType) {
    return TARGET_FIELD_MAPPINGS[target]?.[entityType] || {};
  }
  return TARGET_FIELD_MAPPINGS[target] || {};
}

export default {
  generateExportPreview,
  formatPreviewAsTable,
  getTargetFieldMappings,
};
