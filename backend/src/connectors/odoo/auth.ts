/**
 * Odoo API Key Authentication
 * Task: T039
 *
 * Handles Odoo authentication using API keys or username/password.
 * Supports both XML-RPC and JSON-RPC authentication methods.
 */

export interface OdooAuthConfig {
  url: string;
  database: string;
  username: string;
  apiKey?: string;
  password?: string;
}

export interface OdooAuthResult {
  success: boolean;
  userId?: number;
  sessionId?: string;
  error?: string;
  serverVersion?: string;
}

export interface OdooServerInfo {
  version: string;
  versionInfo: [number, number, number, string, number];
  serverSeries: string;
  protocolVersion: number;
}

export class OdooAuthHandler {
  private config: OdooAuthConfig;

  constructor(config: OdooAuthConfig) {
    this.config = config;
  }

  /**
   * Authenticate using XML-RPC (common endpoint)
   */
  async authenticateXmlRpc(): Promise<OdooAuthResult> {
    try {
      const credential = this.config.apiKey || this.config.password;

      if (!credential) {
        return { success: false, error: 'Missing API key or password' };
      }

      const response = await fetch(`${this.config.url}/xmlrpc/2/common`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: this.buildAuthXmlRpc(),
      });

      const text = await response.text();

      // Check for fault
      const faultMatch = text.match(/<fault>.*?<string>([^<]+)<\/string>/s);
      if (faultMatch) {
        return { success: false, error: faultMatch[1] };
      }

      // Parse user ID
      const intMatch = text.match(/<int>(\d+)<\/int>/);
      if (intMatch) {
        const userId = parseInt(intMatch[1], 10);

        if (userId === 0 || !userId) {
          return { success: false, error: 'Invalid credentials' };
        }

        // Get server version
        const serverInfo = await this.getServerInfo();

        return {
          success: true,
          userId,
          serverVersion: serverInfo?.version,
        };
      }

      // Check for boolean false (authentication failed)
      const boolMatch = text.match(/<boolean>([01])<\/boolean>/);
      if (boolMatch && boolMatch[1] === '0') {
        return { success: false, error: 'Invalid credentials' };
      }

      return { success: false, error: 'Unexpected authentication response' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Authenticate using JSON-RPC (Odoo 14+)
   */
  async authenticateJsonRpc(): Promise<OdooAuthResult> {
    try {
      const response = await fetch(`${this.config.url}/web/session/authenticate`, {
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
        return {
          success: false,
          error: result.error.message || result.error.data?.message || 'Authentication failed',
        };
      }

      if (!result.result?.uid) {
        return { success: false, error: 'Invalid credentials' };
      }

      return {
        success: true,
        userId: result.result.uid,
        sessionId: result.result.session_id,
        serverVersion: result.result.server_version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Auto-detect and authenticate
   */
  async authenticate(): Promise<OdooAuthResult> {
    // Try JSON-RPC first (newer Odoo versions)
    const jsonResult = await this.authenticateJsonRpc();

    if (jsonResult.success) {
      return jsonResult;
    }

    // Fall back to XML-RPC
    const xmlResult = await this.authenticateXmlRpc();
    return xmlResult;
  }

  /**
   * Get server version info
   */
  async getServerInfo(): Promise<OdooServerInfo | null> {
    try {
      const response = await fetch(`${this.config.url}/xmlrpc/2/common`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0"?>
<methodCall>
  <methodName>version</methodName>
  <params></params>
</methodCall>`,
      });

      const text = await response.text();

      // Parse version string
      const versionMatch = text.match(/<name>server_version<\/name>\s*<value>\s*<string>([^<]+)<\/string>/);
      const seriesMatch = text.match(/<name>server_serie<\/name>\s*<value>\s*<string>([^<]+)<\/string>/);

      if (versionMatch) {
        return {
          version: versionMatch[1],
          versionInfo: [0, 0, 0, '', 0],
          serverSeries: seriesMatch?.[1] || versionMatch[1],
          protocolVersion: 1,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * List available databases
   */
  async listDatabases(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.url}/xmlrpc/2/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0"?>
<methodCall>
  <methodName>list</methodName>
  <params></params>
</methodCall>`,
      });

      const text = await response.text();

      // Parse array of databases
      const databases: string[] = [];
      const matches = text.matchAll(/<string>([^<]+)<\/string>/g);

      for (const match of matches) {
        databases.push(match[1]);
      }

      return databases;
    } catch {
      return [];
    }
  }

  /**
   * Test connection without full authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const serverInfo = await this.getServerInfo();

      if (serverInfo) {
        return { success: true };
      }

      return { success: false, error: 'Could not connect to Odoo server' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Generate API key (requires admin access)
   * Note: This is for documentation - API keys are typically created via Odoo UI
   */
  getApiKeyInstructions(): string {
    return `
To generate an Odoo API key:
1. Log in to Odoo as the user who will connect
2. Go to Settings > Users & Companies > Users
3. Select the user
4. Go to the "Preferences" tab
5. Under "Account Security", click "New API Key"
6. Give it a description (e.g., "Foundry Integration")
7. Copy the generated key (it won't be shown again)

Note: API keys are available in Odoo 14+ and require 2FA to be disabled
or the user to have 2FA enabled for their account.
    `.trim();
  }

  /**
   * Build XML-RPC authentication request
   */
  private buildAuthXmlRpc(): string {
    const credential = this.config.apiKey || this.config.password;
    const escapedCredential = this.escapeXml(credential || '');
    const escapedDatabase = this.escapeXml(this.config.database);
    const escapedUsername = this.escapeXml(this.config.username);

    return `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${escapedDatabase}</string></value></param>
    <param><value><string>${escapedUsername}</string></value></param>
    <param><value><string>${escapedCredential}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;
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
}

/**
 * Create Odoo auth handler
 */
export function createOdooAuthHandler(config: OdooAuthConfig): OdooAuthHandler {
  return new OdooAuthHandler(config);
}
