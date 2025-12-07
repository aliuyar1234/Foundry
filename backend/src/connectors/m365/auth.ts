/**
 * Microsoft 365 OAuth Flow Handler
 * Manages authentication with Microsoft Graph API
 */

import { ConfidentialClientApplication, Configuration, AuthenticationResult } from '@azure/msal-node';

export interface M365AuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface M365Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

// Required Microsoft Graph scopes
export const M365_SCOPES = [
  'https://graph.microsoft.com/.default',
];

// User-delegated scopes for OAuth flow
export const M365_USER_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/Files.Read.All',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/User.Read.All',
  'offline_access',
];

/**
 * Create MSAL configuration
 */
function createMsalConfig(config: M365AuthConfig): Configuration {
  return {
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  };
}

/**
 * Create MSAL client application
 */
export function createMsalClient(config: M365AuthConfig): ConfidentialClientApplication {
  return new ConfidentialClientApplication(createMsalConfig(config));
}

/**
 * Get authorization URL for OAuth flow
 */
export function getAuthorizationUrl(
  config: M365AuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: M365_USER_SCOPES.join(' '),
    state: state,
    prompt: 'consent',
  });

  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: M365AuthConfig,
  code: string,
  redirectUri: string
): Promise<M365Tokens> {
  const client = createMsalClient(config);

  const result = await client.acquireTokenByCode({
    code,
    scopes: M365_USER_SCOPES,
    redirectUri,
  });

  return parseAuthResult(result);
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  config: M365AuthConfig,
  refreshToken: string
): Promise<M365Tokens> {
  // Use direct token endpoint for refresh
  const tokenEndpoint = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: M365_USER_SCOPES.join(' '),
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope || '').split(' '),
  };
}

/**
 * Get client credentials token (app-only)
 */
export async function getClientCredentialsToken(
  config: M365AuthConfig
): Promise<M365Tokens> {
  const client = createMsalClient(config);

  const result = await client.acquireTokenByClientCredential({
    scopes: M365_SCOPES,
  });

  if (!result) {
    throw new Error('Failed to acquire client credentials token');
  }

  return parseAuthResult(result);
}

/**
 * Parse MSAL authentication result
 */
function parseAuthResult(result: AuthenticationResult): M365Tokens {
  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn || new Date(Date.now() + 3600 * 1000),
    scopes: result.scopes,
  };
}

/**
 * Validate M365 configuration
 */
export function validateM365Config(config: Partial<M365AuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.tenantId) {
    errors.push('Missing tenantId');
  } else if (!/^[a-f0-9-]{36}$/.test(config.tenantId) && config.tenantId !== 'common') {
    errors.push('Invalid tenantId format');
  }

  if (!config.clientId) {
    errors.push('Missing clientId');
  } else if (!/^[a-f0-9-]{36}$/.test(config.clientId)) {
    errors.push('Invalid clientId format');
  }

  if (!config.clientSecret) {
    errors.push('Missing clientSecret');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
