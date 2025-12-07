/**
 * Generic SQL Export
 * Generates SQL INSERT statements for PostgreSQL, MySQL, SQL Server
 * T272 - SQL export implementation
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';

export type SqlDialect = 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';

export interface SqlExportOptions {
  dialect: SqlDialect;
  schema?: string;
  tableMappings?: Record<EntityType, string>;
  columnMappings?: Record<string, Record<string, string>>;
  includeCreateTable?: boolean;
  includeTruncate?: boolean;
  batchSize?: number;
  escapeStrings?: boolean;
  nullValue?: string;
  dateFormat?: string;
  includeMetadata?: boolean;
  primaryKeyColumn?: string;
}

export interface SqlExportResult {
  format: 'sql';
  dialect: SqlDialect;
  statements: string[];
  recordCount: number;
  tableCount: number;
  exportedAt: string;
  metadata?: {
    sourceRecordIds: string[];
    tables: string[];
  };
}

// Default table mappings
const DEFAULT_TABLE_MAPPINGS: Record<EntityType, string> = {
  company: 'companies',
  person: 'contacts',
  product: 'products',
  address: 'addresses',
  contact: 'contact_details',
  invoice: 'invoices',
  order: 'orders',
  contract: 'contracts',
  project: 'projects',
  document: 'documents',
};

// Default column mappings for each entity type
const DEFAULT_COLUMN_MAPPINGS: Record<EntityType, Record<string, string>> = {
  company: {
    id: 'id',
    externalId: 'external_id',
    name: 'company_name',
    email: 'email',
    phone: 'phone',
    website: 'website',
    vatId: 'vat_id',
    street: 'street',
    city: 'city',
    postalCode: 'postal_code',
    country: 'country',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  person: {
    id: 'id',
    externalId: 'external_id',
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
    mobile: 'mobile',
    jobTitle: 'job_title',
    department: 'department',
    companyId: 'company_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  product: {
    id: 'id',
    externalId: 'external_id',
    name: 'product_name',
    sku: 'sku',
    ean: 'ean',
    description: 'description',
    price: 'price',
    currency: 'currency',
    unit: 'unit',
    category: 'category',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  address: {
    id: 'id',
    externalId: 'external_id',
    addressType: 'address_type',
    street: 'street',
    city: 'city',
    postalCode: 'postal_code',
    state: 'state',
    country: 'country',
    parentId: 'parent_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  contact: {
    id: 'id',
    externalId: 'external_id',
    type: 'contact_type',
    value: 'contact_value',
    isPrimary: 'is_primary',
    parentId: 'parent_id',
  },
  invoice: {
    id: 'id',
    invoiceNumber: 'invoice_number',
    customerId: 'customer_id',
    date: 'invoice_date',
    dueDate: 'due_date',
    total: 'total_amount',
    currency: 'currency',
    status: 'status',
  },
  order: {
    id: 'id',
    orderNumber: 'order_number',
    customerId: 'customer_id',
    date: 'order_date',
    total: 'total_amount',
    status: 'status',
  },
  contract: {
    id: 'id',
    contractNumber: 'contract_number',
    customerId: 'customer_id',
    startDate: 'start_date',
    endDate: 'end_date',
    value: 'contract_value',
  },
  project: {
    id: 'id',
    name: 'project_name',
    description: 'description',
    startDate: 'start_date',
    endDate: 'end_date',
    status: 'status',
  },
  document: {
    id: 'id',
    name: 'document_name',
    type: 'document_type',
    path: 'file_path',
    size: 'file_size',
    parentId: 'parent_id',
  },
};

/**
 * Get SQL dialect-specific quote character for identifiers
 */
function getIdentifierQuote(dialect: SqlDialect): string {
  switch (dialect) {
    case 'mysql':
      return '`';
    case 'sqlserver':
      return '"';
    case 'postgresql':
    case 'sqlite':
    default:
      return '"';
  }
}

/**
 * Quote an identifier (table or column name)
 */
function quoteIdentifier(name: string, dialect: SqlDialect): string {
  const quote = getIdentifierQuote(dialect);
  return `${quote}${name}${quote}`;
}

/**
 * Escape a string value for SQL
 */
function escapeString(value: string, dialect: SqlDialect): string {
  let escaped = value.replace(/'/g, "''");

  if (dialect === 'mysql') {
    escaped = escaped.replace(/\\/g, '\\\\');
  }

  return `'${escaped}'`;
}

/**
 * Format a value for SQL
 */
function formatValue(
  value: any,
  dialect: SqlDialect,
  options: SqlExportOptions
): string {
  if (value === null || value === undefined) {
    return options.nullValue || 'NULL';
  }

  if (typeof value === 'boolean') {
    if (dialect === 'postgresql') {
      return value ? 'TRUE' : 'FALSE';
    }
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (value instanceof Date) {
    const iso = value.toISOString();
    if (dialect === 'mysql') {
      return `'${iso.slice(0, 19).replace('T', ' ')}'`;
    }
    return `'${iso}'`;
  }

  if (typeof value === 'object') {
    // JSON objects
    const json = JSON.stringify(value);
    if (dialect === 'postgresql') {
      return `'${json.replace(/'/g, "''")}'::jsonb`;
    }
    return escapeString(json, dialect);
  }

  return escapeString(String(value), dialect);
}

/**
 * Generate CREATE TABLE statement
 */
function generateCreateTable(
  entityType: EntityType,
  tableName: string,
  columnMappings: Record<string, string>,
  dialect: SqlDialect,
  options: SqlExportOptions
): string {
  const q = (name: string) => quoteIdentifier(name, dialect);
  const schema = options.schema ? `${q(options.schema)}.` : '';

  const columns = Object.values(columnMappings).map((col) => {
    // Infer column type based on name patterns
    let type = 'VARCHAR(255)';
    if (col === 'id' || col.endsWith('_id')) {
      type = dialect === 'postgresql' ? 'UUID' : 'VARCHAR(36)';
    } else if (col.includes('date') || col.includes('_at')) {
      type = dialect === 'postgresql' ? 'TIMESTAMP' : 'DATETIME';
    } else if (col.includes('amount') || col.includes('price') || col.includes('value')) {
      type = dialect === 'postgresql' ? 'NUMERIC(12,2)' : 'DECIMAL(12,2)';
    } else if (col === 'is_primary' || col.startsWith('is_')) {
      type = 'BOOLEAN';
    } else if (col === 'description' || col === 'notes') {
      type = 'TEXT';
    }

    return `  ${q(col)} ${type}`;
  });

  const pkCol = options.primaryKeyColumn || 'id';
  if (columns.some(c => c.includes(q(pkCol)))) {
    columns.push(`  PRIMARY KEY (${q(pkCol)})`);
  }

  return `CREATE TABLE IF NOT EXISTS ${schema}${q(tableName)} (\n${columns.join(',\n')}\n);`;
}

/**
 * Generate INSERT statements for records
 */
function generateInserts(
  records: EntityRecord[],
  entityType: EntityType,
  tableName: string,
  columnMappings: Record<string, string>,
  dialect: SqlDialect,
  options: SqlExportOptions
): string[] {
  const statements: string[] = [];
  const q = (name: string) => quoteIdentifier(name, dialect);
  const schema = options.schema ? `${q(options.schema)}.` : '';

  const sourceFields = Object.keys(columnMappings);
  const targetColumns = Object.values(columnMappings);

  const batchSize = options.batchSize || 100;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values: string[] = [];

    for (const record of batch) {
      const data = { ...record, ...record.data, ...record.normalizedData };
      const rowValues = sourceFields.map((field) => {
        const value = data[field];
        return formatValue(value, dialect, options);
      });
      values.push(`(${rowValues.join(', ')})`);
    }

    const columnsStr = targetColumns.map(c => q(c)).join(', ');

    if (dialect === 'postgresql') {
      // PostgreSQL supports ON CONFLICT
      const pkCol = options.primaryKeyColumn || 'id';
      statements.push(
        `INSERT INTO ${schema}${q(tableName)} (${columnsStr})\nVALUES\n  ${values.join(',\n  ')}\nON CONFLICT (${q(pkCol)}) DO NOTHING;`
      );
    } else if (dialect === 'mysql') {
      statements.push(
        `INSERT IGNORE INTO ${schema}${q(tableName)} (${columnsStr})\nVALUES\n  ${values.join(',\n  ')};`
      );
    } else {
      statements.push(
        `INSERT INTO ${schema}${q(tableName)} (${columnsStr})\nVALUES\n  ${values.join(',\n  ')};`
      );
    }
  }

  return statements;
}

/**
 * Export entity records to SQL format
 */
export async function exportToSql(
  records: EntityRecord[],
  options: SqlExportOptions
): Promise<SqlExportResult> {
  const statements: string[] = [];
  const tables: string[] = [];

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

  // Add header comment
  statements.push(`-- SQL Export generated at ${new Date().toISOString()}`);
  statements.push(`-- Dialect: ${options.dialect}`);
  statements.push(`-- Records: ${records.length}`);
  statements.push('');

  // Process each entity type
  for (const [entityType, typeRecords] of Object.entries(byType)) {
    const type = entityType as EntityType;
    const tableName = options.tableMappings?.[type] || DEFAULT_TABLE_MAPPINGS[type] || type;
    const columnMappings = {
      ...DEFAULT_COLUMN_MAPPINGS[type],
      ...options.columnMappings?.[type],
    };

    tables.push(tableName);

    // Add CREATE TABLE if requested
    if (options.includeCreateTable) {
      statements.push(`-- Create table ${tableName}`);
      statements.push(generateCreateTable(type, tableName, columnMappings, options.dialect, options));
      statements.push('');
    }

    // Add TRUNCATE if requested
    if (options.includeTruncate) {
      const q = (name: string) => quoteIdentifier(name, options.dialect);
      const schema = options.schema ? `${q(options.schema)}.` : '';
      statements.push(`TRUNCATE TABLE ${schema}${q(tableName)};`);
    }

    // Add INSERT statements
    statements.push(`-- Insert ${typeRecords.length} ${entityType} records`);
    const inserts = generateInserts(
      typeRecords,
      type,
      tableName,
      columnMappings,
      options.dialect,
      options
    );
    statements.push(...inserts);
    statements.push('');
  }

  return {
    format: 'sql',
    dialect: options.dialect,
    statements,
    recordCount: records.length,
    tableCount: tables.length,
    exportedAt: new Date().toISOString(),
    metadata: options.includeMetadata
      ? {
          sourceRecordIds: records.map((r) => r.id),
          tables,
        }
      : undefined,
  };
}

/**
 * Convert SQL export result to a single SQL file content
 */
export function toSqlString(result: SqlExportResult): string {
  return result.statements.join('\n');
}

/**
 * Get supported SQL dialects
 */
export function getSupportedDialects(): SqlDialect[] {
  return ['postgresql', 'mysql', 'sqlserver', 'sqlite'];
}

/**
 * Get default table mappings
 */
export function getDefaultTableMappings(): Record<EntityType, string> {
  return { ...DEFAULT_TABLE_MAPPINGS };
}

/**
 * Get default column mappings for an entity type
 */
export function getDefaultColumnMappings(entityType: EntityType): Record<string, string> {
  return { ...DEFAULT_COLUMN_MAPPINGS[entityType] };
}

export default {
  exportToSql,
  toSqlString,
  getSupportedDialects,
  getDefaultTableMappings,
  getDefaultColumnMappings,
};
