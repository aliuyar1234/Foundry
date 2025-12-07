/**
 * Google Workspace OAuth Flow Handler
 * Manages authentication with Google APIs
 */

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

// User-delegated scopes for OAuth flow
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Admin SDK scopes for domain-wide delegation
export const GOOGLE_ADMIN_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * Get authorization URL for OAuth flow
 */
export function getAuthorizationUrl(
  config: GoogleAuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES.join(' '),
    state: state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: GoogleAuthConfig,
  code: string,
  redirectUri: string
): Promise<GoogleTokens> {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
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
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
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
 * Refresh access token
 */
export async function refreshAccessToken(
  config: GoogleAuthConfig,
  refreshToken: string
): Promise<GoogleTokens> {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
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
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope || '').split(' '),
  };
}

/**
 * Revoke access token
 */
export async function revokeToken(token: string): Promise<void> {
  const revokeEndpoint = `https://oauth2.googleapis.com/revoke?token=${token}`;

  const response = await fetch(revokeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token revocation failed: ${error}`);
  }
}

/**
 * Validate Google configuration
 */
export function validateGoogleConfig(config: Partial<GoogleAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push('Missing clientId');
  } else if (!config.clientId.endsWith('.apps.googleusercontent.com')) {
    errors.push('Invalid clientId format - should end with .apps.googleusercontent.com');
  }

  if (!config.clientSecret) {
    errors.push('Missing clientSecret');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get user info from access token
 */
export async function getUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture?: string;
}> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get user info: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}
