/**
 * Odoo Custom Field Mapper
 * Task: T048
 *
 * Maps Odoo custom fields (x_*) to normalized field names.
 * Supports field type detection and value transformation.
 */

import { OdooXmlRpcClient } from './xmlrpcClient';
import { OdooRestClient } from './restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface FieldDefinition {
  name: string;
  type: string;
  label: string;
  required: boolean;
  readonly: boolean;
  relation?: string;
  selection?: Array<[string, string]>;
  help?: string;
  isCustom: boolean;
}

export interface FieldMapping {
  odooField: string;
  normalizedName: string;
  type: string;
  transform?: (value: unknown) => unknown;
}

export interface CustomFieldConfig {
  model: string;
  mappings: FieldMapping[];
  includeUnmapped?: boolean;
}

// Standard Odoo field type mappings
const TYPE_MAPPINGS: Record<string, string> = {
  char: 'string',
  text: 'text',
  html: 'html',
  integer: 'integer',
  float: 'float',
  monetary: 'currency',
  boolean: 'boolean',
  date: 'date',
  datetime: 'datetime',
  binary: 'binary',
  selection: 'enum',
  many2one: 'reference',
  one2many: 'array',
  many2many: 'array',
};

export class OdooCustomFieldMapper {
  private client: OdooClient;
  private fieldCache: Map<string, Record<string, FieldDefinition>> = new Map();
  private mappingConfigs: Map<string, CustomFieldConfig> = new Map();

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Load field definitions for a model
   */
  async loadFieldDefinitions(model: string): Promise<Record<string, FieldDefinition>> {
    if (this.fieldCache.has(model)) {
      return this.fieldCache.get(model)!;
    }

    const fields = await this.client.call<Record<string, any>>(
      model,
      'fields_get',
      [],
      {
        attributes: [
          'type',
          'string',
          'required',
          'readonly',
          'relation',
          'selection',
          'help',
        ],
      }
    );

    const definitions: Record<string, FieldDefinition> = {};

    for (const [name, info] of Object.entries(fields)) {
      definitions[name] = {
        name,
        type: info.type,
        label: info.string || name,
        required: info.required || false,
        readonly: info.readonly || false,
        relation: info.relation,
        selection: info.selection,
        help: info.help,
        isCustom: name.startsWith('x_'),
      };
    }

    this.fieldCache.set(model, definitions);
    return definitions;
  }

  /**
   * Get custom fields for a model
   */
  async getCustomFields(model: string): Promise<FieldDefinition[]> {
    const definitions = await this.loadFieldDefinitions(model);
    return Object.values(definitions).filter((f) => f.isCustom);
  }

  /**
   * Configure field mappings for a model
   */
  configureMapping(config: CustomFieldConfig): void {
    this.mappingConfigs.set(config.model, config);
  }

  /**
   * Map record fields to normalized format
   */
  async mapRecord(
    model: string,
    record: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const definitions = await this.loadFieldDefinitions(model);
    const config = this.mappingConfigs.get(model);
    const result: Record<string, unknown> = {};

    for (const [fieldName, value] of Object.entries(record)) {
      const definition = definitions[fieldName];
      if (!definition) continue;

      // Check if there's a specific mapping
      const mapping = config?.mappings.find((m) => m.odooField === fieldName);

      if (mapping) {
        // Apply mapping
        const transformedValue = mapping.transform
          ? mapping.transform(value)
          : this.transformValue(value, definition.type);
        result[mapping.normalizedName] = transformedValue;
      } else if (definition.isCustom) {
        // Auto-map custom fields
        const normalizedName = this.normalizeFieldName(fieldName);
        result[normalizedName] = this.transformValue(value, definition.type);
      } else if (config?.includeUnmapped !== false) {
        // Include standard fields
        result[fieldName] = this.transformValue(value, definition.type);
      }
    }

    return result;
  }

  /**
   * Transform value based on field type
   */
  transformValue(value: unknown, fieldType: string): unknown {
    if (value === null || value === undefined || value === false) {
      return null;
    }

    switch (fieldType) {
      case 'many2one':
        // [id, name] -> { id, name }
        if (Array.isArray(value) && value.length === 2) {
          return { id: value[0], name: value[1] };
        }
        return value;

      case 'many2many':
      case 'one2many':
        // Array of IDs
        return Array.isArray(value) ? value : [];

      case 'date':
      case 'datetime':
        // Convert to ISO string
        if (typeof value === 'string') {
          return new Date(value).toISOString();
        }
        return value;

      case 'selection':
        // Return value as-is (could be enhanced to return label)
        return value;

      case 'monetary':
      case 'float':
        // Ensure numeric
        return typeof value === 'number' ? value : parseFloat(String(value));

      case 'integer':
        return typeof value === 'number' ? Math.floor(value) : parseInt(String(value), 10);

      case 'boolean':
        return Boolean(value);

      case 'binary':
        // Base64 encoded
        return value;

      default:
        return value;
    }
  }

  /**
   * Normalize custom field name
   */
  normalizeFieldName(odooName: string): string {
    // Remove x_ prefix
    let name = odooName.replace(/^x_/, '');

    // Convert snake_case to camelCase
    name = name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    return name;
  }

  /**
   * Reverse normalize: camelCase to odoo field name
   */
  denormalizeFieldName(normalizedName: string): string {
    // Convert camelCase to snake_case
    const snakeCase = normalizedName.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`
    );

    return `x_${snakeCase}`;
  }

  /**
   * Get normalized type for Odoo field type
   */
  getNormalizedType(odooType: string): string {
    return TYPE_MAPPINGS[odooType] || 'unknown';
  }

  /**
   * Generate mapping configuration from model fields
   */
  async generateMappingConfig(
    model: string,
    options: {
      includeStandard?: boolean;
      customMappings?: Record<string, string>;
    } = {}
  ): Promise<CustomFieldConfig> {
    const definitions = await this.loadFieldDefinitions(model);
    const mappings: FieldMapping[] = [];

    for (const [name, definition] of Object.entries(definitions)) {
      // Skip internal fields
      if (name.startsWith('__') || name === 'id') continue;

      // Check for custom mapping
      if (options.customMappings?.[name]) {
        mappings.push({
          odooField: name,
          normalizedName: options.customMappings[name],
          type: this.getNormalizedType(definition.type),
        });
        continue;
      }

      // Include custom fields
      if (definition.isCustom) {
        mappings.push({
          odooField: name,
          normalizedName: this.normalizeFieldName(name),
          type: this.getNormalizedType(definition.type),
        });
        continue;
      }

      // Optionally include standard fields
      if (options.includeStandard) {
        mappings.push({
          odooField: name,
          normalizedName: name,
          type: this.getNormalizedType(definition.type),
        });
      }
    }

    return {
      model,
      mappings,
      includeUnmapped: !options.includeStandard,
    };
  }

  /**
   * Validate record against field definitions
   */
  async validateRecord(
    model: string,
    record: Record<string, unknown>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const definitions = await this.loadFieldDefinitions(model);
    const errors: string[] = [];

    // Check required fields
    for (const [name, definition] of Object.entries(definitions)) {
      if (definition.required && !definition.readonly) {
        const value = record[name];
        if (value === null || value === undefined || value === false || value === '') {
          errors.push(`Required field '${definition.label}' (${name}) is missing`);
        }
      }
    }

    // Validate field types
    for (const [name, value] of Object.entries(record)) {
      const definition = definitions[name];
      if (!definition) continue;

      const error = this.validateFieldValue(value, definition);
      if (error) {
        errors.push(error);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate single field value
   */
  private validateFieldValue(
    value: unknown,
    definition: FieldDefinition
  ): string | null {
    if (value === null || value === undefined || value === false) {
      return null; // Allow null values (required check is separate)
    }

    switch (definition.type) {
      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return `Field '${definition.label}' must be an integer`;
        }
        break;

      case 'float':
      case 'monetary':
        if (typeof value !== 'number') {
          return `Field '${definition.label}' must be a number`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Field '${definition.label}' must be a boolean`;
        }
        break;

      case 'selection':
        if (definition.selection) {
          const validValues = definition.selection.map((s) => s[0]);
          if (!validValues.includes(value as string)) {
            return `Field '${definition.label}' must be one of: ${validValues.join(', ')}`;
          }
        }
        break;

      case 'many2one':
        if (!Array.isArray(value) && typeof value !== 'number') {
          return `Field '${definition.label}' must be a reference (ID or [ID, name])`;
        }
        break;

      case 'many2many':
      case 'one2many':
        if (!Array.isArray(value)) {
          return `Field '${definition.label}' must be an array`;
        }
        break;
    }

    return null;
  }

  /**
   * Clear field cache
   */
  clearCache(): void {
    this.fieldCache.clear();
  }
}

/**
 * Create custom field mapper
 */
export function createOdooCustomFieldMapper(
  client: OdooClient
): OdooCustomFieldMapper {
  return new OdooCustomFieldMapper(client);
}
