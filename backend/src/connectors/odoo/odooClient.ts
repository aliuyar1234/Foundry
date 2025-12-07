/**
 * Odoo API Client Wrapper
 * Supports both XML-RPC (Odoo <14) and JSON-RPC/REST (Odoo 14+)
 */

export interface OdooClientConfig {
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  password?: string;
  apiType?: 'xmlrpc' | 'rest';
}

export interface OdooAuthResult {
  userId: number;
  sessionId?: string;
}

export interface OdooRecord {
  id: number;
  [key: string]: unknown;
}

export interface OdooSearchReadOptions {
  domain?: Array<[string, string, unknown]>;
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export interface OdooSearchReadResult<T = OdooRecord> {
  records: T[];
  length: number;
}

/**
 * Odoo XML-RPC client
 */
export class OdooXmlRpcClient {
  private config: OdooClientConfig;
  private userId: number | null = null;

  constructor(config: OdooClientConfig) {
    this.config = config;
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate(): Promise<OdooAuthResult> {
    const response = await fetch(`${this.config.url}/xmlrpc/2/common`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: this.buildXmlRpcRequest('authenticate', [
        this.config.database,
        this.config.username,
        this.config.apiKey || this.config.password,
        {},
      ]),
    });

    const result = await this.parseXmlRpcResponse(response);

    if (!result || result === false) {
      throw new Error('Odoo authentication failed');
    }

    this.userId = result as number;
    return { userId: this.userId };
  }

  /**
   * Execute object method
   */
  async execute<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.userId) {
      await this.authenticate();
    }

    const response = await fetch(`${this.config.url}/xmlrpc/2/object`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: this.buildXmlRpcRequest('execute_kw', [
        this.config.database,
        this.userId,
        this.config.apiKey || this.config.password,
        model,
        method,
        args,
        kwargs,
      ]),
    });

    return this.parseXmlRpcResponse(response);
  }

  /**
   * Search and read records
   */
  async searchRead<T extends OdooRecord>(
    model: string,
    options: OdooSearchReadOptions = {}
  ): Promise<T[]> {
    const { domain = [], fields, limit, offset, order } = options;

    const kwargs: Record<string, unknown> = {};
    if (fields?.length) kwargs.fields = fields;
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;

    return this.execute<T[]>(model, 'search_read', [domain], kwargs);
  }

  /**
   * Read records by IDs
   */
  async read<T extends OdooRecord>(
    model: string,
    ids: number[],
    fields?: string[]
  ): Promise<T[]> {
    const kwargs: Record<string, unknown> = {};
    if (fields?.length) kwargs.fields = fields;

    return this.execute<T[]>(model, 'read', [ids], kwargs);
  }

  /**
   * Search record IDs
   */
  async search(
    model: string,
    domain: Array<[string, string, unknown]> = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<number[]> {
    return this.execute<number[]>(model, 'search', [domain], options);
  }

  /**
   * Count records
   */
  async searchCount(
    model: string,
    domain: Array<[string, string, unknown]> = []
  ): Promise<number> {
    return this.execute<number>(model, 'search_count', [domain]);
  }

  /**
   * Get model fields
   */
  async fieldsGet(
    model: string,
    attributes?: string[]
  ): Promise<Record<string, unknown>> {
    const kwargs: Record<string, unknown> = {};
    if (attributes?.length) kwargs.attributes = attributes;

    return this.execute<Record<string, unknown>>(model, 'fields_get', [], kwargs);
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build XML-RPC request body
   */
  private buildXmlRpcRequest(method: string, params: unknown[]): string {
    const paramsXml = params.map((p) => this.valueToXml(p)).join('');
    return `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>${paramsXml}</params>
</methodCall>`;
  }

  /**
   * Convert value to XML-RPC format
   */
  private valueToXml(value: unknown): string {
    if (value === null || value === undefined) {
      return '<param><value><boolean>0</boolean></value></param>';
    }

    if (typeof value === 'boolean') {
      return `<param><value><boolean>${value ? 1 : 0}</boolean></value></param>`;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return `<param><value><int>${value}</int></value></param>`;
      }
      return `<param><value><double>${value}</double></value></param>`;
    }

    if (typeof value === 'string') {
      return `<param><value><string>${this.escapeXml(value)}</string></value></param>`;
    }

    if (Array.isArray(value)) {
      const items = value
        .map((v) => `<value>${this.valueContentToXml(v)}</value>`)
        .join('');
      return `<param><value><array><data>${items}</data></array></value></param>`;
    }

    if (typeof value === 'object') {
      const members = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `<member><name>${k}</name><value>${this.valueContentToXml(v)}</value></member>`)
        .join('');
      return `<param><value><struct>${members}</struct></value></param>`;
    }

    return `<param><value><string>${String(value)}</string></value></param>`;
  }

  /**
   * Convert value content to XML (without param wrapper)
   */
  private valueContentToXml(value: unknown): string {
    if (value === null || value === undefined) {
      return '<boolean>0</boolean>';
    }

    if (typeof value === 'boolean') {
      return `<boolean>${value ? 1 : 0}</boolean>`;
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return `<int>${value}</int>`;
      }
      return `<double>${value}</double>`;
    }

    if (typeof value === 'string') {
      return `<string>${this.escapeXml(value)}</string>`;
    }

    if (Array.isArray(value)) {
      const items = value
        .map((v) => `<value>${this.valueContentToXml(v)}</value>`)
        .join('');
      return `<array><data>${items}</data></array>`;
    }

    if (typeof value === 'object') {
      const members = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `<member><name>${k}</name><value>${this.valueContentToXml(v)}</value></member>`)
        .join('');
      return `<struct>${members}</struct>`;
    }

    return `<string>${String(value)}</string>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Parse XML-RPC response
   */
  private async parseXmlRpcResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    // Simple XML parsing for common response types
    // In production, use a proper XML-RPC parser library

    // Check for fault
    const faultMatch = text.match(/<fault>.*?<string>([^<]+)<\/string>/s);
    if (faultMatch) {
      throw new Error(`Odoo XML-RPC fault: ${faultMatch[1]}`);
    }

    // Parse int value
    const intMatch = text.match(/<int>(\d+)<\/int>/);
    if (intMatch) {
      return parseInt(intMatch[1], 10);
    }

    // Parse boolean
    const boolMatch = text.match(/<boolean>([01])<\/boolean>/);
    if (boolMatch) {
      return boolMatch[1] === '1';
    }

    // Parse string
    const stringMatch = text.match(/<string>([^<]*)<\/string>/);
    if (stringMatch) {
      return stringMatch[1];
    }

    // For complex responses, return the raw text for now
    // A proper implementation would fully parse arrays and structs
    return text;
  }
}

/**
 * Odoo JSON-RPC client (for Odoo 14+)
 */
export class OdooJsonRpcClient {
  private config: OdooClientConfig;
  private sessionId: string | null = null;
  private userId: number | null = null;

  constructor(config: OdooClientConfig) {
    this.config = config;
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate(): Promise<OdooAuthResult> {
    const response = await fetch(`${this.config.url}/web/session/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db: this.config.database,
          login: this.config.username,
          password: this.config.apiKey || this.config.password,
        },
        id: Date.now(),
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Odoo authentication failed: ${result.error.message}`);
    }

    if (!result.result?.uid) {
      throw new Error('Odoo authentication failed: No user ID returned');
    }

    this.userId = result.result.uid;
    this.sessionId = result.result.session_id;

    return { userId: this.userId, sessionId: this.sessionId || undefined };
  }

  /**
   * Call model method via JSON-RPC
   */
  async call<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.sessionId) {
      await this.authenticate();
    }

    const response = await fetch(`${this.config.url}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${this.sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model,
          method,
          args,
          kwargs,
        },
        id: Date.now(),
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Odoo call failed: ${result.error.message || result.error.data?.message}`);
    }

    return result.result;
  }

  /**
   * Search and read records
   */
  async searchRead<T extends OdooRecord>(
    model: string,
    options: OdooSearchReadOptions = {}
  ): Promise<T[]> {
    const { domain = [], fields, limit, offset, order } = options;

    const kwargs: Record<string, unknown> = {
      domain,
    };
    if (fields?.length) kwargs.fields = fields;
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;

    return this.call<T[]>(model, 'search_read', [], kwargs);
  }

  /**
   * Read records by IDs
   */
  async read<T extends OdooRecord>(
    model: string,
    ids: number[],
    fields?: string[]
  ): Promise<T[]> {
    return this.call<T[]>(model, 'read', [ids, fields || []]);
  }

  /**
   * Search record IDs
   */
  async search(
    model: string,
    domain: Array<[string, string, unknown]> = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<number[]> {
    return this.call<number[]>(model, 'search', [domain], options);
  }

  /**
   * Count records
   */
  async searchCount(
    model: string,
    domain: Array<[string, string, unknown]> = []
  ): Promise<number> {
    return this.call<number>(model, 'search_count', [domain]);
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create appropriate Odoo client based on API type
 */
export function createOdooClient(
  config: OdooClientConfig
): OdooXmlRpcClient | OdooJsonRpcClient {
  if (config.apiType === 'rest') {
    return new OdooJsonRpcClient(config);
  }
  return new OdooXmlRpcClient(config);
}

/**
 * Odoo model types for common entities
 */
export interface OdooPartner extends OdooRecord {
  name: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  zip?: string;
  country_id?: [number, string];
  is_company: boolean;
  customer_rank?: number;
  supplier_rank?: number;
  create_date: string;
  write_date: string;
}

export interface OdooProduct extends OdooRecord {
  name: string;
  default_code?: string;
  barcode?: string;
  type: 'consu' | 'service' | 'product';
  list_price: number;
  standard_price: number;
  categ_id: [number, string];
  create_date: string;
  write_date: string;
}

export interface OdooSaleOrder extends OdooRecord {
  name: string;
  partner_id: [number, string];
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel';
  date_order: string;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  currency_id: [number, string];
  order_line: number[];
  create_date: string;
  write_date: string;
}

export interface OdooPurchaseOrder extends OdooRecord {
  name: string;
  partner_id: [number, string];
  state: 'draft' | 'sent' | 'to approve' | 'purchase' | 'done' | 'cancel';
  date_order: string;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  currency_id: [number, string];
  order_line: number[];
  create_date: string;
  write_date: string;
}

export interface OdooAccountMove extends OdooRecord {
  name: string;
  partner_id?: [number, string];
  move_type: 'entry' | 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund' | 'out_receipt' | 'in_receipt';
  state: 'draft' | 'posted' | 'cancel';
  invoice_date?: string;
  date: string;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  amount_residual: number;
  currency_id: [number, string];
  create_date: string;
  write_date: string;
}
