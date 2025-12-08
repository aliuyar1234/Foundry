/**
 * Odoo REST API Client
 * Task: T041
 *
 * REST/JSON-RPC client for Odoo 14+.
 * Provides modern API access with session management.
 */

export interface RestClientConfig {
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  password?: string;
  timeout?: number;
}

export interface SessionInfo {
  uid: number;
  sessionId: string;
  username: string;
  name: string;
  companyId: number;
  companyIds: number[];
  serverVersion: string;
  userContext: Record<string, unknown>;
}

export class OdooRestClient {
  private config: RestClientConfig;
  private sessionId: string | null = null;
  private userId: number | null = null;
  private sessionInfo: SessionInfo | null = null;
  private timeout: number;

  constructor(config: RestClientConfig) {
    this.config = config;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Authenticate and get session
   */
  async authenticate(): Promise<SessionInfo> {
    const response = await this.fetchWithTimeout('/web/session/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(
        result.error.message || result.error.data?.message || 'Authentication failed'
      );
    }

    if (!result.result?.uid) {
      throw new Error('Invalid credentials');
    }

    // Extract session cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const sessionMatch = setCookie.match(/session_id=([^;]+)/);
      if (sessionMatch) {
        this.sessionId = sessionMatch[1];
      }
    }

    // Fallback to result session_id
    if (!this.sessionId && result.result.session_id) {
      this.sessionId = result.result.session_id;
    }

    this.userId = result.result.uid;
    this.sessionInfo = {
      uid: result.result.uid,
      sessionId: this.sessionId || '',
      username: result.result.username || this.config.username,
      name: result.result.name || '',
      companyId: result.result.company_id || 1,
      companyIds: result.result.company_ids || [1],
      serverVersion: result.result.server_version || '',
      userContext: result.result.user_context || {},
    };

    return this.sessionInfo;
  }

  /**
   * Ensure session is active
   */
  private async ensureSession(): Promise<void> {
    if (!this.sessionId) {
      await this.authenticate();
    }
  }

  /**
   * Call model method
   */
  async call<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    await this.ensureSession();

    const response = await this.fetchWithTimeout('/web/dataset/call_kw', {
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
      // Check if session expired
      if (
        result.error.message?.includes('Session') ||
        result.error.data?.name === 'odoo.http.SessionExpiredException'
      ) {
        // Clear session and retry
        this.sessionId = null;
        await this.authenticate();
        return this.call<T>(model, method, args, kwargs);
      }

      throw new Error(
        result.error.message || result.error.data?.message || 'RPC call failed'
      );
    }

    return result.result;
  }

  /**
   * Search records
   */
  async search(
    model: string,
    domain: Array<[string, string, unknown]> = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<number[]> {
    return this.call<number[]>(model, 'search', [domain], options);
  }

  /**
   * Read records by IDs
   */
  async read<T>(model: string, ids: number[], fields?: string[]): Promise<T[]> {
    return this.call<T[]>(model, 'read', [ids, fields || []]);
  }

  /**
   * Search and read
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
    const kwargs: Record<string, unknown> = { domain };

    if (options.fields?.length) kwargs.fields = options.fields;
    if (options.limit !== undefined) kwargs.limit = options.limit;
    if (options.offset !== undefined) kwargs.offset = options.offset;
    if (options.order) kwargs.order = options.order;

    return this.call<T[]>(model, 'search_read', [], kwargs);
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
   * Create record
   */
  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.call<number>(model, 'create', [values]);
  }

  /**
   * Update records
   */
  async write(
    model: string,
    ids: number[],
    values: Record<string, unknown>
  ): Promise<boolean> {
    return this.call<boolean>(model, 'write', [ids, values]);
  }

  /**
   * Delete records
   */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.call<boolean>(model, 'unlink', [ids]);
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

    return this.call<Record<string, unknown>>(model, 'fields_get', [], kwargs);
  }

  /**
   * Execute workflow action
   */
  async executeAction(
    model: string,
    ids: number[],
    action: string
  ): Promise<unknown> {
    return this.call<unknown>(model, action, [ids]);
  }

  /**
   * Get record name
   */
  async nameGet(model: string, ids: number[]): Promise<Array<[number, string]>> {
    return this.call<Array<[number, string]>>(model, 'name_get', [ids]);
  }

  /**
   * Search by name
   */
  async nameSearch(
    model: string,
    name: string,
    options: {
      args?: Array<[string, string, unknown]>;
      operator?: string;
      limit?: number;
    } = {}
  ): Promise<Array<[number, string]>> {
    return this.call<Array<[number, string]>>(
      model,
      'name_search',
      [name, options.args || []],
      {
        operator: options.operator || 'ilike',
        limit: options.limit || 100,
      }
    );
  }

  /**
   * Get report PDF
   */
  async getReport(reportName: string, ids: number[]): Promise<Blob> {
    await this.ensureSession();

    const response = await this.fetchWithTimeout(
      `/report/pdf/${reportName}/${ids.join(',')}`,
      {
        method: 'GET',
        headers: {
          Cookie: `session_id=${this.sessionId}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get report: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Get attachment
   */
  async getAttachment(
    attachmentId: number
  ): Promise<{ name: string; data: string; mimeType: string }> {
    const attachments = await this.read<{
      name: string;
      datas: string;
      mimetype: string;
    }>('ir.attachment', [attachmentId], ['name', 'datas', 'mimetype']);

    if (!attachments.length) {
      throw new Error('Attachment not found');
    }

    return {
      name: attachments[0].name,
      data: attachments[0].datas,
      mimeType: attachments[0].mimetype,
    };
  }

  /**
   * Upload attachment
   */
  async uploadAttachment(
    name: string,
    data: string,
    options: {
      resModel?: string;
      resId?: number;
      mimeType?: string;
    } = {}
  ): Promise<number> {
    return this.create('ir.attachment', {
      name,
      datas: data,
      res_model: options.resModel,
      res_id: options.resId,
      mimetype: options.mimeType || 'application/octet-stream',
    });
  }

  /**
   * Get session info
   */
  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * Get user ID
   */
  getUserId(): number | null {
    return this.userId;
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
   * Logout and destroy session
   */
  async logout(): Promise<void> {
    if (!this.sessionId) return;

    try {
      await this.fetchWithTimeout('/web/session/destroy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_id=${this.sessionId}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {},
          id: Date.now(),
        }),
      });
    } finally {
      this.sessionId = null;
      this.userId = null;
      this.sessionInfo = null;
    }
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    path: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(`${this.config.url}${path}`, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create REST client
 */
export function createOdooRestClient(config: RestClientConfig): OdooRestClient {
  return new OdooRestClient(config);
}
