/**
 * Docuware DMS Authentication Handler
 * Task: T161
 * Manages authentication with Docuware REST API (cloud and on-premise)
 */

export interface DocuwareAuthConfig {
  hostUrl: string; // Cloud: https://xxx.docuware.cloud or On-premise: https://your-server
  username: string;
  password?: string;
  clientId?: string; // OAuth client ID
  clientSecret?: string; // OAuth client secret
  environment?: 'cloud' | 'onpremise';
}

export interface DocuwareTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
}

export interface DocuwareAuthResult {
  success: boolean;
  tokens?: DocuwareTokens;
  error?: string;
  organizationId?: string;
  userId?: string;
}

/**
 * Authenticate using username/password (basic auth or form-based)
 * Works for both cloud and on-premise
 */
export async function authenticateWithPassword(
  config: DocuwareAuthConfig
): Promise<DocuwareAuthResult> {
  const loginEndpoint = `${config.hostUrl}/DocuWare/Platform/Account/Logon`;

  try {
    const response = await fetch(loginEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        UserName: config.username,
        Password: config.password || '',
        Organization: '',
        RememberMe: 'false',
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Authentication failed: ${error}`,
      };
    }

    const data = await response.json();

    // Extract cookie for token
    const setCookie = response.headers.get('set-cookie');
    const token = extractTokenFromCookie(setCookie);

    return {
      success: true,
      tokens: {
        accessToken: token || data.token || '',
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour default
        tokenType: 'Bearer',
      },
      organizationId: data.OrganizationId,
      userId: data.UserId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Authenticate using OAuth 2.0 (cloud only)
 */
export async function authenticateWithOAuth(
  config: DocuwareAuthConfig,
  authCode: string,
  redirectUri: string
): Promise<DocuwareAuthResult> {
  const tokenEndpoint = `${config.hostUrl}/DocuWare/Platform/Account/OAuth/Token`;

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: redirectUri,
      client_id: config.clientId || '',
      client_secret: config.clientSecret || '',
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: `OAuth authentication failed: ${error.error_description || error.error}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        tokenType: data.token_type || 'Bearer',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth authentication failed',
    };
  }
}

/**
 * Refresh OAuth access token
 */
export async function refreshAccessToken(
  config: DocuwareAuthConfig,
  refreshToken: string
): Promise<DocuwareAuthResult> {
  const tokenEndpoint = `${config.hostUrl}/DocuWare/Platform/Account/OAuth/Token`;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId || '',
      client_secret: config.clientSecret || '',
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: `Token refresh failed: ${error.error_description || error.error}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        tokenType: data.token_type || 'Bearer',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
    };
  }
}

/**
 * Get OAuth authorization URL (cloud only)
 */
export function getAuthorizationUrl(
  config: DocuwareAuthConfig,
  redirectUri: string,
  state: string
): string {
  const authEndpoint = `${config.hostUrl}/DocuWare/Platform/Account/OAuth/Authorize`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId || '',
    redirect_uri: redirectUri,
    state: state,
    scope: 'full', // Full API access
  });

  return `${authEndpoint}?${params.toString()}`;
}

/**
 * Validate Docuware configuration
 */
export function validateDocuwareConfig(config: Partial<DocuwareAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.hostUrl) {
    errors.push('Missing hostUrl');
  } else {
    try {
      new URL(config.hostUrl);
    } catch {
      errors.push('Invalid hostUrl - must be a valid URL');
    }
  }

  if (!config.username) {
    errors.push('Missing username');
  }

  // OAuth requires clientId and clientSecret
  if (config.clientId && !config.clientSecret) {
    errors.push('clientSecret required when using OAuth (clientId provided)');
  }

  // Password auth requires password
  if (!config.clientId && !config.password) {
    errors.push('Either password (basic auth) or clientId/clientSecret (OAuth) required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test Docuware connection
 */
export async function testConnection(
  config: DocuwareAuthConfig,
  accessToken: string
): Promise<{ success: boolean; error?: string; version?: string }> {
  try {
    const response = await fetch(`${config.hostUrl}/DocuWare/Platform/Home`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Connection test failed: ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      version: data.Version,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

/**
 * Extract token from Set-Cookie header
 */
function extractTokenFromCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;

  // Docuware uses .DWPLATFORMAUTH cookie
  const match = setCookie.match(/\.DWPLATFORMAUTH=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Logout and invalidate token
 */
export async function logout(
  config: DocuwareAuthConfig,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${config.hostUrl}/DocuWare/Platform/Account/Logoff`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Logout failed: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Logout failed',
    };
  }
}

/**
 * DocuwareAuthHandler class for comprehensive auth management
 */
export class DocuwareAuthHandler {
  private config: DocuwareAuthConfig;

  constructor(config: DocuwareAuthConfig) {
    this.config = config;
  }

  /**
   * Authenticate based on configuration
   * Auto-selects OAuth or password authentication
   */
  async authenticate(options?: {
    authCode?: string;
    redirectUri?: string;
  }): Promise<DocuwareAuthResult> {
    // Use OAuth if clientId is provided
    if (this.config.clientId && options?.authCode && options?.redirectUri) {
      return authenticateWithOAuth(this.config, options.authCode, options.redirectUri);
    }

    // Fall back to password authentication
    return authenticateWithPassword(this.config);
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<DocuwareAuthResult> {
    return refreshAccessToken(this.config, refreshToken);
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    return getAuthorizationUrl(this.config, redirectUri, state);
  }

  /**
   * Test connection
   */
  async testConnection(accessToken: string): Promise<{
    success: boolean;
    error?: string;
    version?: string;
  }> {
    return testConnection(this.config, accessToken);
  }

  /**
   * Logout
   */
  async logout(accessToken: string): Promise<{ success: boolean; error?: string }> {
    return logout(this.config, accessToken);
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    return validateDocuwareConfig(this.config);
  }
}

/**
 * Create Docuware auth handler
 */
export function createDocuwareAuthHandler(config: DocuwareAuthConfig): DocuwareAuthHandler {
  return new DocuwareAuthHandler(config);
}
