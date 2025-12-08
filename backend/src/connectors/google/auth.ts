/**
 * Google Workspace OAuth Flow Handler
 * Task: T016 (Enhanced)
 * Manages authentication with Google APIs
 */

import { OAuthTokens } from '../base/oauthTokenManager';

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

export interface GoogleAuthResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
  userInfo?: {
    email: string;
    name?: string;
    picture?: string;
    domain?: string;
  };
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
  domain?: string;
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
    domain: data.hd, // Hosted domain for Google Workspace
  };
}

/**
 * GoogleAuthHandler class for more comprehensive auth management
 * Task: T016
 */
export class GoogleAuthHandler {
  private config: GoogleAuthConfig;

  constructor(config: GoogleAuthConfig) {
    this.config = config;
  }

  /**
   * Generate OAuth authorization URL with additional options
   */
  getAuthorizationUrl(
    redirectUri: string,
    state: string,
    options?: {
      loginHint?: string;
      hostedDomain?: string;
      prompt?: 'none' | 'consent' | 'select_account';
      scopes?: string[];
    }
  ): string {
    const scopes = options?.scopes || GOOGLE_SCOPES;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: state,
      access_type: 'offline',
      prompt: options?.prompt || 'consent',
      include_granted_scopes: 'true',
    });

    if (options?.loginHint) {
      params.set('login_hint', options.loginHint);
    }

    if (options?.hostedDomain) {
      params.set('hd', options.hostedDomain);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange code and return with user info
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<GoogleAuthResult> {
    try {
      const tokens = await exchangeCodeForTokens(this.config, code, redirectUri);
      const userInfo = await getUserInfo(tokens.accessToken);

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          tokenType: 'Bearer',
          scope: tokens.scopes.join(' '),
          metadata: {
            userEmail: userInfo.email,
            domain: userInfo.domain,
          },
        },
        userInfo: {
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          domain: userInfo.domain,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleAuthResult> {
    try {
      const tokens = await refreshAccessToken(this.config, refreshToken);

      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || refreshToken,
          expiresAt: tokens.expiresAt,
          tokenType: 'Bearer',
          scope: tokens.scopes.join(' '),
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
   * Validate access token
   */
  async validateToken(accessToken: string): Promise<{
    valid: boolean;
    expiresIn?: number;
    email?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );

      if (!response.ok) {
        return { valid: false, error: 'Invalid token' };
      }

      const data = await response.json();
      return {
        valid: true,
        expiresIn: data.expires_in,
        email: data.email,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }
}

/**
 * Create Google Auth handler
 */
export function createGoogleAuthHandler(config: GoogleAuthConfig): GoogleAuthHandler {
  return new GoogleAuthHandler(config);
}
