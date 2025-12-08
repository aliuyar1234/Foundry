/**
 * Connector Configuration Validation Service
 * Task: T014
 *
 * Validates connector configurations against schemas and business rules.
 * Supports runtime validation, type checking, and custom validators.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface ConnectorSchema {
  connectorType: string;
  version: string;
  schema: Record<string, unknown>;
  customValidators?: CustomValidator[];
}

export interface CustomValidator {
  field: string;
  validator: (value: unknown, config: Record<string, unknown>) => ValidationResult | Promise<ValidationResult>;
}

// JSON Schema definitions for each connector type
const connectorSchemas: Record<string, ConnectorSchema> = {
  google_workspace: {
    connectorType: 'google_workspace',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['clientId', 'clientSecret'],
      properties: {
        clientId: {
          type: 'string',
          minLength: 20,
          description: 'Google OAuth Client ID',
        },
        clientSecret: {
          type: 'string',
          minLength: 10,
          description: 'Google OAuth Client Secret',
        },
        domain: {
          type: 'string',
          format: 'hostname',
          description: 'Google Workspace domain',
        },
        adminEmail: {
          type: 'string',
          format: 'email',
          description: 'Admin email for domain-wide delegation',
        },
        syncEmails: {
          type: 'boolean',
          default: true,
          description: 'Sync Gmail data',
        },
        syncCalendar: {
          type: 'boolean',
          default: true,
          description: 'Sync Calendar data',
        },
        syncDrive: {
          type: 'boolean',
          default: true,
          description: 'Sync Drive data',
        },
        lookbackDays: {
          type: 'integer',
          minimum: 1,
          maximum: 365,
          default: 90,
          description: 'Days of historical data to sync',
        },
      },
    },
  },

  odoo: {
    connectorType: 'odoo',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['url', 'database'],
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'Odoo instance URL',
        },
        database: {
          type: 'string',
          minLength: 1,
          description: 'Odoo database name',
        },
        username: {
          type: 'string',
          description: 'Odoo username (for API key auth)',
        },
        apiKey: {
          type: 'string',
          minLength: 10,
          description: 'Odoo API key',
        },
        useXmlRpc: {
          type: 'boolean',
          default: false,
          description: 'Use XML-RPC instead of REST API',
        },
        modules: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sale', 'purchase', 'stock', 'account', 'crm', 'hr'],
          },
          default: ['sale', 'purchase', 'stock'],
          description: 'Odoo modules to sync',
        },
        selfHosted: {
          type: 'boolean',
          default: false,
          description: 'Is this a self-hosted instance?',
        },
        proxyUrl: {
          type: 'string',
          format: 'uri',
          description: 'Proxy URL for self-hosted instances',
        },
      },
    },
  },

  sap_b1: {
    connectorType: 'sap_b1',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['serviceLayerUrl', 'companyDb'],
      properties: {
        serviceLayerUrl: {
          type: 'string',
          format: 'uri',
          description: 'SAP B1 Service Layer URL',
        },
        companyDb: {
          type: 'string',
          minLength: 1,
          description: 'Company database name',
        },
        username: {
          type: 'string',
          minLength: 1,
          description: 'SAP B1 username',
        },
        password: {
          type: 'string',
          minLength: 1,
          description: 'SAP B1 password',
        },
        isHana: {
          type: 'boolean',
          default: false,
          description: 'Is this SAP B1 on HANA?',
        },
        language: {
          type: 'string',
          default: 'de',
          enum: ['de', 'en', 'fr', 'es', 'it'],
          description: 'Interface language',
        },
        syncDocuments: {
          type: 'boolean',
          default: true,
          description: 'Sync business documents',
        },
        syncBusinessPartners: {
          type: 'boolean',
          default: true,
          description: 'Sync business partners',
        },
        syncItems: {
          type: 'boolean',
          default: true,
          description: 'Sync items/products',
        },
        syncApprovals: {
          type: 'boolean',
          default: true,
          description: 'Sync approval workflows',
        },
      },
    },
  },

  salesforce: {
    connectorType: 'salesforce',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['clientId', 'clientSecret'],
      properties: {
        clientId: {
          type: 'string',
          minLength: 10,
          description: 'Salesforce Connected App Client ID',
        },
        clientSecret: {
          type: 'string',
          minLength: 10,
          description: 'Salesforce Connected App Client Secret',
        },
        isSandbox: {
          type: 'boolean',
          default: false,
          description: 'Use sandbox environment',
        },
        apiVersion: {
          type: 'string',
          pattern: '^[0-9]{2}\\.[0-9]$',
          default: '59.0',
          description: 'Salesforce API version',
        },
        objects: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['Account', 'Contact', 'Opportunity', 'Lead', 'Case'],
          description: 'Salesforce objects to sync',
        },
        customObjects: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_]+__c$',
          },
          description: 'Custom objects to sync (must end with __c)',
        },
        useBulkApi: {
          type: 'boolean',
          default: true,
          description: 'Use Bulk API for large syncs',
        },
      },
    },
  },

  hubspot: {
    connectorType: 'hubspot',
    version: '1.0.0',
    schema: {
      type: 'object',
      oneOf: [
        { required: ['accessToken'] },
        { required: ['clientId', 'clientSecret'] },
      ],
      properties: {
        clientId: {
          type: 'string',
          minLength: 10,
          description: 'HubSpot OAuth Client ID',
        },
        clientSecret: {
          type: 'string',
          minLength: 10,
          description: 'HubSpot OAuth Client Secret',
        },
        accessToken: {
          type: 'string',
          minLength: 10,
          description: 'HubSpot Private App Access Token',
        },
        portalId: {
          type: 'string',
          pattern: '^[0-9]+$',
          description: 'HubSpot Portal ID',
        },
        syncContacts: {
          type: 'boolean',
          default: true,
          description: 'Sync contacts',
        },
        syncCompanies: {
          type: 'boolean',
          default: true,
          description: 'Sync companies',
        },
        syncDeals: {
          type: 'boolean',
          default: true,
          description: 'Sync deals',
        },
        syncTickets: {
          type: 'boolean',
          default: true,
          description: 'Sync tickets',
        },
        syncEngagements: {
          type: 'boolean',
          default: true,
          description: 'Sync engagements (emails, calls, meetings)',
        },
      },
    },
  },

  slack: {
    connectorType: 'slack',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['clientId', 'clientSecret'],
      properties: {
        clientId: {
          type: 'string',
          minLength: 10,
          description: 'Slack App Client ID',
        },
        clientSecret: {
          type: 'string',
          minLength: 10,
          description: 'Slack App Client Secret',
        },
        teamId: {
          type: 'string',
          pattern: '^T[A-Z0-9]+$',
          description: 'Slack Team ID',
        },
        syncPublicChannels: {
          type: 'boolean',
          default: true,
          description: 'Sync public channels',
        },
        syncPrivateChannels: {
          type: 'boolean',
          default: false,
          description: 'Sync private channels (requires additional permissions)',
        },
        syncDirectMessages: {
          type: 'boolean',
          default: false,
          description: 'Sync direct messages (requires additional permissions)',
        },
        channelFilter: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific channel IDs to sync (empty = all)',
        },
        excludeChannels: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Channel IDs to exclude',
        },
        lookbackDays: {
          type: 'integer',
          minimum: 1,
          maximum: 365,
          default: 30,
          description: 'Days of historical messages to sync',
        },
      },
    },
  },

  datev: {
    connectorType: 'datev',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['chartOfAccounts'],
      properties: {
        chartOfAccounts: {
          type: 'string',
          enum: ['SKR03', 'SKR04', 'custom'],
          description: 'Chart of accounts to use',
        },
        customChartFile: {
          type: 'string',
          description: 'Path to custom chart definition (if chartOfAccounts is custom)',
        },
        fiscalYearStart: {
          type: 'integer',
          minimum: 1,
          maximum: 12,
          default: 1,
          description: 'Fiscal year start month',
        },
        importFormat: {
          type: 'string',
          enum: ['xml', 'csv', 'api'],
          default: 'xml',
          description: 'Import format',
        },
        apiEndpoint: {
          type: 'string',
          format: 'uri',
          description: 'Datev Connect API endpoint (if importFormat is api)',
        },
        clientId: {
          type: 'string',
          description: 'Datev Connect Client ID',
        },
        clientSecret: {
          type: 'string',
          description: 'Datev Connect Client Secret',
        },
      },
    },
    customValidators: [
      {
        field: 'customChartFile',
        validator: (value, config) => {
          if (config.chartOfAccounts === 'custom' && !value) {
            return {
              valid: false,
              errors: [
                {
                  field: 'customChartFile',
                  message: 'Custom chart file is required when using custom chart of accounts',
                  code: 'CUSTOM_CHART_REQUIRED',
                },
              ],
              warnings: [],
            };
          }
          return { valid: true, errors: [], warnings: [] };
        },
      },
    ],
  },

  bmd: {
    connectorType: 'bmd',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['apiUrl', 'clientId', 'clientSecret'],
      properties: {
        apiUrl: {
          type: 'string',
          format: 'uri',
          description: 'BMD API URL',
        },
        clientId: {
          type: 'string',
          minLength: 1,
          description: 'BMD Client ID',
        },
        clientSecret: {
          type: 'string',
          minLength: 1,
          description: 'BMD Client Secret',
        },
        companyId: {
          type: 'string',
          description: 'BMD Company/Mandant ID',
        },
        modules: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['fibu', 'lohn', 'kore', 'anbu'],
          },
          default: ['fibu'],
          description: 'BMD modules to sync',
        },
        syncPayrollMetadata: {
          type: 'boolean',
          default: true,
          description: 'Sync payroll process metadata (no salary data)',
        },
        syncTaxDeadlines: {
          type: 'boolean',
          default: true,
          description: 'Sync Austrian tax deadlines (UVA, ZM)',
        },
      },
    },
  },

  docuware: {
    connectorType: 'docuware',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['url', 'username', 'password'],
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'Docuware server URL',
        },
        username: {
          type: 'string',
          minLength: 1,
          description: 'Docuware username',
        },
        password: {
          type: 'string',
          minLength: 1,
          description: 'Docuware password',
        },
        organization: {
          type: 'string',
          description: 'Docuware organization',
        },
        fileCabinets: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'File cabinet IDs to sync',
        },
        syncMetadataOnly: {
          type: 'boolean',
          default: true,
          description: 'Sync document metadata only (no content)',
        },
        syncWorkflows: {
          type: 'boolean',
          default: true,
          description: 'Sync workflow states',
        },
      },
    },
  },

  mfiles: {
    connectorType: 'mfiles',
    version: '1.0.0',
    schema: {
      type: 'object',
      required: ['serverUrl', 'vaultGuid'],
      properties: {
        serverUrl: {
          type: 'string',
          format: 'uri',
          description: 'M-Files server URL',
        },
        vaultGuid: {
          type: 'string',
          pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
          description: 'M-Files Vault GUID',
        },
        username: {
          type: 'string',
          description: 'M-Files username',
        },
        password: {
          type: 'string',
          description: 'M-Files password',
        },
        domain: {
          type: 'string',
          description: 'Windows domain (for Windows auth)',
        },
        authType: {
          type: 'string',
          enum: ['mfiles', 'windows'],
          default: 'mfiles',
          description: 'Authentication type',
        },
        objectTypes: {
          type: 'array',
          items: {
            type: 'integer',
          },
          description: 'Object type IDs to sync',
        },
        syncMetadataOnly: {
          type: 'boolean',
          default: true,
          description: 'Sync object metadata only (no files)',
        },
        syncWorkflows: {
          type: 'boolean',
          default: true,
          description: 'Sync workflow states',
        },
      },
    },
  },
};

export class ConfigValidatorService {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();
  private schemas: Map<string, ConnectorSchema> = new Map();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      coerceTypes: true,
    });
    addFormats(this.ajv);

    // Register all schemas
    for (const [type, schema] of Object.entries(connectorSchemas)) {
      this.registerSchema(type, schema);
    }
  }

  /**
   * Register a connector schema
   */
  registerSchema(connectorType: string, schema: ConnectorSchema): void {
    this.schemas.set(connectorType, schema);
    const validator = this.ajv.compile(schema.schema);
    this.validators.set(connectorType, validator);
  }

  /**
   * Validate connector configuration
   */
  async validate(
    connectorType: string,
    config: Record<string, unknown>
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if schema exists
    const schema = this.schemas.get(connectorType);
    if (!schema) {
      return {
        valid: false,
        errors: [
          {
            field: 'connectorType',
            message: `Unknown connector type: ${connectorType}`,
            code: 'UNKNOWN_CONNECTOR_TYPE',
          },
        ],
        warnings: [],
      };
    }

    // Run JSON Schema validation
    const validator = this.validators.get(connectorType)!;
    const isValid = validator(config);

    if (!isValid && validator.errors) {
      for (const error of validator.errors) {
        errors.push(this.formatAjvError(error));
      }
    }

    // Run custom validators
    if (schema.customValidators) {
      for (const customValidator of schema.customValidators) {
        const result = await customValidator.validator(
          config[customValidator.field],
          config
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    // Run common validations
    this.runCommonValidations(connectorType, config, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get schema for a connector type
   */
  getSchema(connectorType: string): ConnectorSchema | null {
    return this.schemas.get(connectorType) || null;
  }

  /**
   * Get all registered connector types
   */
  getConnectorTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get required fields for a connector
   */
  getRequiredFields(connectorType: string): string[] {
    const schema = this.schemas.get(connectorType);
    if (!schema) {
      return [];
    }

    const jsonSchema = schema.schema as { required?: string[] };
    return jsonSchema.required || [];
  }

  /**
   * Get optional fields with defaults for a connector
   */
  getFieldDefaults(connectorType: string): Record<string, unknown> {
    const schema = this.schemas.get(connectorType);
    if (!schema) {
      return {};
    }

    const defaults: Record<string, unknown> = {};
    const jsonSchema = schema.schema as {
      properties?: Record<string, { default?: unknown }>;
    };

    if (jsonSchema.properties) {
      for (const [field, def] of Object.entries(jsonSchema.properties)) {
        if (def.default !== undefined) {
          defaults[field] = def.default;
        }
      }
    }

    return defaults;
  }

  // Private methods

  private formatAjvError(error: ErrorObject): ValidationError {
    const field = error.instancePath
      ? error.instancePath.replace(/^\//, '').replace(/\//g, '.')
      : error.params?.missingProperty || 'root';

    let message = error.message || 'Validation failed';
    let code = 'VALIDATION_ERROR';

    switch (error.keyword) {
      case 'required':
        message = `Missing required field: ${error.params?.missingProperty}`;
        code = 'REQUIRED_FIELD_MISSING';
        break;
      case 'type':
        message = `Invalid type: expected ${error.params?.type}`;
        code = 'INVALID_TYPE';
        break;
      case 'format':
        message = `Invalid format: expected ${error.params?.format}`;
        code = 'INVALID_FORMAT';
        break;
      case 'minLength':
        message = `Value too short: minimum length is ${error.params?.limit}`;
        code = 'VALUE_TOO_SHORT';
        break;
      case 'enum':
        message = `Invalid value: must be one of ${error.params?.allowedValues?.join(', ')}`;
        code = 'INVALID_ENUM_VALUE';
        break;
      case 'pattern':
        message = `Invalid format: does not match expected pattern`;
        code = 'PATTERN_MISMATCH';
        break;
    }

    return { field, message, code };
  }

  private runCommonValidations(
    connectorType: string,
    config: Record<string, unknown>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Check for potentially sensitive fields without encryption hints
    const sensitiveFields = ['password', 'secret', 'apiKey', 'token', 'credential'];
    for (const field of Object.keys(config)) {
      const lowerField = field.toLowerCase();
      if (sensitiveFields.some((sf) => lowerField.includes(sf))) {
        if (typeof config[field] === 'string') {
          // Check if it looks like it might be in plain text
          const value = config[field] as string;
          if (!value.startsWith('enc:') && !value.startsWith('vault:')) {
            warnings.push({
              field,
              message: `Field '${field}' appears to contain sensitive data. Consider encrypting before storage.`,
              code: 'SENSITIVE_FIELD_PLAINTEXT',
            });
          }
        }
      }
    }

    // OAuth connectors should have redirect URI configured
    const oauthConnectors = ['google_workspace', 'salesforce', 'hubspot', 'slack'];
    if (oauthConnectors.includes(connectorType) && !config.redirectUri) {
      warnings.push({
        field: 'redirectUri',
        message: 'No redirect URI configured. OAuth callback may fail.',
        code: 'MISSING_REDIRECT_URI',
      });
    }

    // Check rate limit configuration
    if (config.rateLimits) {
      const rateLimits = config.rateLimits as Record<string, number>;
      if (rateLimits.requestsPerSecond && rateLimits.requestsPerSecond > 100) {
        warnings.push({
          field: 'rateLimits.requestsPerSecond',
          message: 'High rate limit may cause API throttling',
          code: 'HIGH_RATE_LIMIT',
        });
      }
    }
  }
}

/**
 * Singleton instance
 */
let configValidatorInstance: ConfigValidatorService | null = null;

export function getConfigValidatorService(): ConfigValidatorService {
  if (!configValidatorInstance) {
    configValidatorInstance = new ConfigValidatorService();
  }
  return configValidatorInstance;
}
