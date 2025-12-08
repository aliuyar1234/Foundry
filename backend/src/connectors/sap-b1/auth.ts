/**
 * SAP B1 Service Layer Authentication
 * Task: T057
 *
 * Handles authentication to SAP Business One Service Layer.
 * Supports both session-based and token-based authentication.
 */

export interface SapB1AuthConfig {
  serverUrl: string;
  companyDb: string;
  username: string;
  password: string;
  sslEnabled?: boolean;
  language?: string;
}

export interface SapB1AuthResult {
  success: boolean;
  sessionId?: string;
  version?: string;
  sessionTimeout?: number;
  error?: string;
}

export interface SapB1ServerInfo {
  version: string;
  patchLevel: string;
  apiVersion: string;
  isHANA: boolean;
}

export class SapB1AuthHandler {
  private config: SapB1AuthConfig;
  private baseUrl: string;

  constructor(config: SapB1AuthConfig) {
    this.config = config;
    const protocol = config.sslEnabled !== false ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.serverUrl}/b1s/v1`;
  }

  /**
   * Authenticate with SAP B1 Service Layer
   */
  async authenticate(): Promise<SapB1AuthResult> {
    try {
      const response = await fetch(`${this.baseUrl}/Login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          CompanyDB: this.config.companyDb,
          UserName: this.config.username,
          Password: this.config.password,
          Language: this.config.language || '23', // English by default
        }),
      });

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);
        return {
          success: false,
          error: error || 'Authentication failed',
        };
      }

      const result = await response.json();

      // Extract session ID from cookie
      const setCookie = response.headers.get('set-cookie');
      const sessionMatch = setCookie?.match(/B1SESSION=([^;]+)/);

      if (!sessionMatch) {
        return {
          success: false,
          error: 'No session cookie returned',
        };
      }

      return {
        success: true,
        sessionId: sessionMatch[1],
        version: result.Version,
        sessionTimeout: result.SessionTimeout || 30,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Logout from SAP B1 Service Layer
   */
  async logout(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/Logout`, {
        method: 'POST',
        headers: {
          Cookie: `B1SESSION=${sessionId}`,
        },
      });

      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<SapB1ServerInfo | null> {
    try {
      // Try to get server info without authentication
      const response = await fetch(`${this.baseUrl}/$metadata`, {
        method: 'GET',
      });

      if (!response.ok) {
        return null;
      }

      const text = await response.text();

      // Parse version from metadata
      const versionMatch = text.match(/Version="([^"]+)"/);
      const isHANA = text.includes('HANA') || this.config.serverUrl.includes('hana');

      return {
        version: versionMatch?.[1] || 'unknown',
        patchLevel: 'unknown',
        apiVersion: 'v1',
        isHANA,
      };
    } catch {
      return null;
    }
  }

  /**
   * Test connection without full authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string; serverInfo?: SapB1ServerInfo }> {
    try {
      // First try to reach the server
      const serverInfo = await this.getServerInfo();

      if (!serverInfo) {
        // Try to authenticate to test connection
        const authResult = await this.authenticate();

        if (authResult.success) {
          await this.logout(authResult.sessionId!);
          return {
            success: true,
            serverInfo: {
              version: authResult.version || 'unknown',
              patchLevel: 'unknown',
              apiVersion: 'v1',
              isHANA: false,
            },
          };
        }

        return {
          success: false,
          error: authResult.error,
        };
      }

      return {
        success: true,
        serverInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * List available company databases
   */
  async listCompanyDatabases(): Promise<string[]> {
    try {
      // This endpoint may not be available on all versions
      const response = await fetch(
        `${this.baseUrl.replace('/b1s/v1', '')}/CompanyService/GetCompanyList`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const result = await response.json();
      return result.value || [];
    } catch {
      return [];
    }
  }

  /**
   * Parse error response
   */
  private async parseErrorResponse(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return data.error?.message?.value || data.error?.message || response.statusText;
    } catch {
      return response.statusText;
    }
  }
}

/**
 * Create SAP B1 auth handler
 */
export function createSapB1AuthHandler(config: SapB1AuthConfig): SapB1AuthHandler {
  return new SapB1AuthHandler(config);
}
