/**
 * Odoo XML-RPC Client
 * Task: T040
 *
 * Dedicated XML-RPC client for Odoo versions < 14.
 * Handles all XML-RPC protocol specifics.
 */

export interface XmlRpcConfig {
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  password?: string;
  timeout?: number;
}

export interface XmlRpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OdooXmlRpcClient {
  private config: XmlRpcConfig;
  private userId: number | null = null;
  private timeout: number;

  constructor(config: XmlRpcConfig) {
    this.config = config;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate(): Promise<number> {
    const credential = this.config.apiKey || this.config.password;

    if (!credential) {
      throw new Error('Missing API key or password');
    }

    const response = await this.callCommon('authenticate', [
      this.config.database,
      this.config.username,
      credential,
      {},
    ]);

    if (!response || response === false || response === 0) {
      throw new Error('Odoo authentication failed');
    }

    this.userId = response as number;
    return this.userId;
  }

  /**
   * Ensure authenticated
   */
  private async ensureAuthenticated(): Promise<number> {
    if (!this.userId) {
      await this.authenticate();
    }
    return this.userId!;
  }

  /**
   * Execute model method
   */
  async execute<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    const userId = await this.ensureAuthenticated();
    const credential = this.config.apiKey || this.config.password;

    return this.callObject<T>('execute_kw', [
      this.config.database,
      userId,
      credential,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  /**
   * Search records
   */
  async search(
    model: string,
    domain: Array<[string, string, unknown]> = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<number[]> {
    return this.execute<number[]>(model, 'search', [domain], options);
  }

  /**
   * Read records by IDs
   */
  async read<T>(
    model: string,
    ids: number[],
    fields?: string[]
  ): Promise<T[]> {
    const kwargs: Record<string, unknown> = {};
    if (fields?.length) kwargs.fields = fields;

    return this.execute<T[]>(model, 'read', [ids], kwargs);
  }

  /**
   * Search and read in one call
   */
  async searchRead<T>(
    model: string,
    domain: Array<[string, string, unknown]> = [],
    options: {
      fields?: string[];
      limit?: number;
      offset?: number;
      order?: string;
    } = {}
  ): Promise<T[]> {
    const { fields, limit, offset, order } = options;
    const kwargs: Record<string, unknown> = {};

    if (fields?.length) kwargs.fields = fields;
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;

    return this.execute<T[]>(model, 'search_read', [domain], kwargs);
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
   * Create record
   */
  async create(
    model: string,
    values: Record<string, unknown>
  ): Promise<number> {
    return this.execute<number>(model, 'create', [values]);
  }

  /**
   * Update records
   */
  async write(
    model: string,
    ids: number[],
    values: Record<string, unknown>
  ): Promise<boolean> {
    return this.execute<boolean>(model, 'write', [ids, values]);
  }

  /**
   * Delete records
   */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.execute<boolean>(model, 'unlink', [ids]);
  }

  /**
   * Get field definitions
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
   * Get installed modules
   */
  async getInstalledModules(): Promise<string[]> {
    const modules = await this.searchRead<{ name: string }>(
      'ir.module.module',
      [['state', '=', 'installed']],
      { fields: ['name'] }
    );

    return modules.map((m) => m.name);
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
   * Get user ID
   */
  getUserId(): number | null {
    return this.userId;
  }

  /**
   * Call common endpoint
   */
  private async callCommon<T>(method: string, params: unknown[]): Promise<T> {
    return this.callEndpoint<T>('/xmlrpc/2/common', method, params);
  }

  /**
   * Call object endpoint
   */
  private async callObject<T>(method: string, params: unknown[]): Promise<T> {
    return this.callEndpoint<T>('/xmlrpc/2/object', method, params);
  }

  /**
   * Make XML-RPC call
   */
  private async callEndpoint<T>(
    endpoint: string,
    method: string,
    params: unknown[]
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.config.url}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: this.buildRequest(method, params),
        signal: controller.signal,
      });

      const text = await response.text();
      return this.parseResponse<T>(text);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build XML-RPC request
   */
  private buildRequest(method: string, params: unknown[]): string {
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
    return `<param><value>${this.valueContentToXml(value)}</value></param>`;
  }

  /**
   * Convert value content to XML
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

    if (value instanceof Date) {
      return `<dateTime.iso8601>${value.toISOString()}</dateTime.iso8601>`;
    }

    if (Array.isArray(value)) {
      const items = value
        .map((v) => `<value>${this.valueContentToXml(v)}</value>`)
        .join('');
      return `<array><data>${items}</data></array>`;
    }

    if (typeof value === 'object') {
      const members = Object.entries(value as Record<string, unknown>)
        .map(
          ([k, v]) =>
            `<member><name>${k}</name><value>${this.valueContentToXml(v)}</value></member>`
        )
        .join('');
      return `<struct>${members}</struct>`;
    }

    return `<string>${String(value)}</string>`;
  }

  /**
   * Parse XML-RPC response
   */
  private parseResponse<T>(xml: string): T {
    // Check for fault
    const faultMatch = xml.match(
      /<fault>.*?<name>faultString<\/name>\s*<value>\s*<string>([^<]*)<\/string>/s
    );
    if (faultMatch) {
      throw new Error(`Odoo XML-RPC fault: ${faultMatch[1]}`);
    }

    // Extract params value
    const paramsMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
    if (!paramsMatch) {
      throw new Error('Invalid XML-RPC response');
    }

    return this.parseValue(paramsMatch[1]);
  }

  /**
   * Parse XML-RPC value
   */
  private parseValue(xml: string): any {
    // Integer
    const intMatch = xml.match(/<(?:i4|int)>(-?\d+)<\/(?:i4|int)>/);
    if (intMatch) {
      return parseInt(intMatch[1], 10);
    }

    // Double
    const doubleMatch = xml.match(/<double>(-?[\d.]+)<\/double>/);
    if (doubleMatch) {
      return parseFloat(doubleMatch[1]);
    }

    // Boolean
    const boolMatch = xml.match(/<boolean>([01])<\/boolean>/);
    if (boolMatch) {
      return boolMatch[1] === '1';
    }

    // String
    const stringMatch = xml.match(/<string>([^<]*)<\/string>/);
    if (stringMatch) {
      return this.unescapeXml(stringMatch[1]);
    }

    // Empty string (value without type tag)
    if (xml.trim() === '' || xml.match(/^<string\/?>$/)) {
      return '';
    }

    // DateTime
    const dateMatch = xml.match(/<dateTime\.iso8601>([^<]+)<\/dateTime\.iso8601>/);
    if (dateMatch) {
      return new Date(dateMatch[1]);
    }

    // Array
    const arrayMatch = xml.match(/<array>\s*<data>([\s\S]*?)<\/data>\s*<\/array>/);
    if (arrayMatch) {
      const items: unknown[] = [];
      const valueMatches = arrayMatch[1].matchAll(/<value>([\s\S]*?)<\/value>/g);

      for (const match of valueMatches) {
        items.push(this.parseValue(match[1]));
      }

      return items;
    }

    // Struct
    const structMatch = xml.match(/<struct>([\s\S]*?)<\/struct>/);
    if (structMatch) {
      const obj: Record<string, unknown> = {};
      const memberMatches = structMatch[1].matchAll(
        /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g
      );

      for (const match of memberMatches) {
        obj[match[1]] = this.parseValue(match[2]);
      }

      return obj;
    }

    // Nil
    if (xml.includes('<nil/>') || xml.includes('<nil>')) {
      return null;
    }

    // Default: return trimmed content
    return xml.trim();
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
   * Unescape XML special characters
   */
  private unescapeXml(str: string): string {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
}

/**
 * Create XML-RPC client
 */
export function createOdooXmlRpcClient(config: XmlRpcConfig): OdooXmlRpcClient {
  return new OdooXmlRpcClient(config);
}
