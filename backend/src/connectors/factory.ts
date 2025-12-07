/**
 * Connector Factory
 * Creates connector instances based on data source type
 */

import { DataSource, DataSourceType } from '@prisma/client';
import { BaseConnector, ConnectorMetadata } from './base/connector.js';
import { M365Connector } from './m365/index.js';
import { GoogleWorkspaceConnector } from './google/index.js';
import { OdooConnector } from './odoo/index.js';
import { SapB1Connector } from './sap-b1/index.js';
import { SalesforceConnector } from './salesforce/index.js';
import { HubSpotConnector } from './hubspot/index.js';
import { SlackConnector } from './slack/index.js';
import { DatevConnector } from './datev/index.js';
import { BmdConnector } from './bmd/index.js';

// Registry of available connectors
const connectorRegistry: Map<DataSourceType, {
  create: (dataSource: DataSource) => BaseConnector;
  metadata: ConnectorMetadata;
}> = new Map();

/**
 * Register the M365 connector
 */
connectorRegistry.set(DataSourceType.M365, {
  create: (dataSource) => new M365Connector(dataSource),
  metadata: {
    type: 'M365',
    name: 'Microsoft 365',
    description: 'Connect to Microsoft 365 to sync emails, calendar events, and files',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: true,
      supportedResources: ['emails', 'calendar', 'files', 'users'],
      requiredConfig: ['tenantId', 'clientId', 'clientSecret'],
      optionalConfig: ['lookbackMonths', 'syncEmails', 'syncCalendar', 'syncFiles'],
    },
  },
});

/**
 * Register the Google Workspace connector
 */
connectorRegistry.set(DataSourceType.GOOGLE_WORKSPACE, {
  create: (dataSource) => new GoogleWorkspaceConnector(dataSource),
  metadata: {
    type: 'GOOGLE_WORKSPACE',
    name: 'Google Workspace',
    description: 'Connect to Google Workspace to sync Gmail, Calendar, and Drive',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false, // Could be added later with Push notifications
      supportedResources: ['emails', 'calendar', 'files'],
      requiredConfig: ['clientId', 'clientSecret'],
      optionalConfig: ['lookbackMonths', 'syncEmails', 'syncCalendar', 'syncFiles'],
    },
  },
});

/**
 * Register the Odoo connector
 */
connectorRegistry.set(DataSourceType.ODOO, {
  create: (dataSource) => new OdooConnector(dataSource),
  metadata: {
    type: 'ODOO',
    name: 'Odoo ERP',
    description: 'Connect to Odoo to sync customers, vendors, products, orders, and invoices',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['customers', 'vendors', 'products', 'orders', 'invoices'],
      requiredConfig: ['url', 'database', 'username'],
      optionalConfig: ['apiKey', 'password', 'apiType', 'modules', 'lookbackMonths'],
    },
  },
});

/**
 * Register the SAP Business One connector
 */
connectorRegistry.set(DataSourceType.SAP_B1, {
  create: (dataSource) => new SapB1Connector(dataSource),
  metadata: {
    type: 'SAP_B1',
    name: 'SAP Business One',
    description: 'Connect to SAP Business One to sync business partners, items, orders, and invoices',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['customers', 'vendors', 'products', 'orders', 'invoices'],
      requiredConfig: ['serverUrl', 'companyDb', 'username', 'password'],
      optionalConfig: ['sslEnabled', 'syncEntities', 'includeAttachments', 'lookbackMonths'],
    },
  },
});

/**
 * Register the Salesforce connector
 */
connectorRegistry.set(DataSourceType.SALESFORCE, {
  create: (dataSource) => new SalesforceConnector(dataSource),
  metadata: {
    type: 'SALESFORCE',
    name: 'Salesforce',
    description: 'Connect to Salesforce CRM to sync accounts, contacts, opportunities, cases, and leads',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['accounts', 'contacts', 'opportunities', 'cases', 'leads'],
      requiredConfig: ['clientId', 'clientSecret'],
      optionalConfig: ['syncObjects', 'lookbackMonths'],
    },
  },
});

/**
 * Register the HubSpot connector
 */
connectorRegistry.set(DataSourceType.HUBSPOT, {
  create: (dataSource) => new HubSpotConnector(dataSource),
  metadata: {
    type: 'HUBSPOT',
    name: 'HubSpot',
    description: 'Connect to HubSpot CRM to sync companies, contacts, deals, and tickets',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['companies', 'contacts', 'deals', 'tickets'],
      requiredConfig: ['clientId', 'clientSecret'],
      optionalConfig: ['syncObjects', 'lookbackMonths'],
    },
  },
});

/**
 * Register the Slack connector
 */
connectorRegistry.set(DataSourceType.SLACK, {
  create: (dataSource) => new SlackConnector(dataSource),
  metadata: {
    type: 'SLACK',
    name: 'Slack',
    description: 'Connect to Slack to sync users, channels, and messages',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: true,
      supportedResources: ['users', 'channels', 'messages'],
      requiredConfig: ['clientId', 'clientSecret'],
      optionalConfig: ['syncMessages', 'lookbackMonths'],
    },
  },
});

/**
 * Register the DATEV connector
 */
connectorRegistry.set(DataSourceType.DATEV, {
  create: (dataSource) => new DatevConnector(dataSource),
  metadata: {
    type: 'DATEV',
    name: 'DATEV',
    description: 'Connect to DATEV to sync accounting documents, journal entries, and business partners',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['documents', 'accounts', 'journal_entries', 'business_partners'],
      requiredConfig: ['clientId', 'clientSecret'],
      optionalConfig: ['environment', 'lookbackMonths'],
    },
  },
});

/**
 * Register the BMD connector
 */
connectorRegistry.set(DataSourceType.BMD, {
  create: (dataSource) => new BmdConnector(dataSource),
  metadata: {
    type: 'BMD',
    name: 'BMD NTCS',
    description: 'Connect to BMD NTCS to sync accounting documents, journal entries, and business partners',
    capabilities: {
      supportsIncrementalSync: true,
      supportsWebhooks: false,
      supportedResources: ['documents', 'accounts', 'journal_entries', 'business_partners', 'cost_centers'],
      requiredConfig: ['apiUrl', 'apiKey', 'companyId'],
      optionalConfig: ['lookbackMonths'],
    },
  },
});

/**
 * Create a connector instance for a data source
 */
export function createConnector(dataSource: DataSource): BaseConnector {
  const entry = connectorRegistry.get(dataSource.type);

  if (!entry) {
    throw new Error(`Unsupported connector type: ${dataSource.type}`);
  }

  return entry.create(dataSource);
}

/**
 * Check if a connector type is supported
 */
export function isConnectorSupported(type: DataSourceType): boolean {
  return connectorRegistry.has(type);
}

/**
 * Get metadata for a connector type
 */
export function getConnectorMetadata(type: DataSourceType): ConnectorMetadata | null {
  const entry = connectorRegistry.get(type);
  return entry?.metadata || null;
}

/**
 * Get all available connector metadata
 */
export function getAllConnectorMetadata(): ConnectorMetadata[] {
  return Array.from(connectorRegistry.values()).map((entry) => entry.metadata);
}

/**
 * Get supported connector types
 */
export function getSupportedConnectorTypes(): DataSourceType[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Validate connector configuration
 */
export function validateConnectorConfig(
  type: DataSourceType,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const metadata = getConnectorMetadata(type);

  if (!metadata) {
    return { valid: false, errors: [`Unsupported connector type: ${type}`] };
  }

  const errors: string[] = [];

  // Check required config
  for (const required of metadata.capabilities.requiredConfig) {
    if (!(required in config) || config[required] === null || config[required] === undefined) {
      errors.push(`Missing required configuration: ${required}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
