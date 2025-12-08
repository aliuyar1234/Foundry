// =============================================================================
// OIDC Service
// SCALE Tier - Task T261-T270
//
// OpenID Connect authentication service for enterprise SSO
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface OidcConfiguration {
  id: string;
  organizationId: string;
  providerType: 'OIDC';
  enabled: boolean;
  // Provider Configuration
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  endSessionEndpoint?: string;
  // Client Configuration
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;
  // Scopes and Claims
  scopes: string[];
  claimMapping: OidcClaimMapping;
  // Options
  pkceEnabled: boolean;
  noncesEnabled: boolean;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface OidcClaimMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string;
  roles?: string;
  picture?: string;
}

export interface OidcTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  idToken: string;
  scope: string;
}

export interface OidcUserInfo {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  groups?: string[];
  roles?: string[];
  [key: string]: unknown;
}

export interface OidcAuthResult {
  success: boolean;
  user?: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    picture?: string;
    groups?: string[];
    roles?: string[];
    externalId: string;
  };
  tokens?: OidcTokenResponse;
  error?: string;
}

export interface AuthorizationState {
  nonce: string;
  codeVerifier?: string;
  redirectUri: string;
  organizationId: string;
  createdAt: Date;
}

// -----------------------------------------------------------------------------
// OIDC Service
// -----------------------------------------------------------------------------

export class OidcService {
  private prisma: PrismaClient;
  private stateStore: Map<string, AuthorizationState> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Clean up old states periodically
    setInterval(() => this.cleanupStates(), 5 * 60 * 1000); // Every 5 minutes
  }

  // ---------------------------------------------------------------------------
  // Configuration Management
  // ---------------------------------------------------------------------------

  async createConfiguration(
    organizationId: string,
    config: Omit<OidcConfiguration, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<OidcConfiguration> {
    const id = crypto.randomUUID();

    const oidcConfig = await this.prisma.ssoConfiguration.create({
      data: {
        id,
        organizationId,
        providerType: 'OIDC',
        enabled: config.enabled,
        configuration: {
          issuer: config.issuer,
          authorizationEndpoint: config.authorizationEndpoint,
          tokenEndpoint: config.tokenEndpoint,
          userinfoEndpoint: config.userinfoEndpoint,
          jwksUri: config.jwksUri,
          endSessionEndpoint: config.endSessionEndpoint,
          clientId: config.clientId,
          clientSecret: config.clientSecret, // Should be encrypted in production
          redirectUri: config.redirectUri,
          postLogoutRedirectUri: config.postLogoutRedirectUri,
          scopes: config.scopes,
          claimMapping: config.claimMapping,
          pkceEnabled: config.pkceEnabled,
          noncesEnabled: config.noncesEnabled,
        },
      },
    });

    return this.mapToOidcConfiguration(oidcConfig);
  }

  async getConfiguration(organizationId: string): Promise<OidcConfiguration | null> {
    const config = await this.prisma.ssoConfiguration.findFirst({
      where: {
        organizationId,
        providerType: 'OIDC',
      },
    });

    return config ? this.mapToOidcConfiguration(config) : null;
  }

  async discoverConfiguration(issuer: string): Promise<Partial<OidcConfiguration>> {
    // Fetch OpenID Connect Discovery Document
    const wellKnownUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;

    const response = await fetch(wellKnownUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
    }

    const discovery = await response.json();

    return {
      issuer: discovery.issuer,
      authorizationEndpoint: discovery.authorization_endpoint,
      tokenEndpoint: discovery.token_endpoint,
      userinfoEndpoint: discovery.userinfo_endpoint,
      jwksUri: discovery.jwks_uri,
      endSessionEndpoint: discovery.end_session_endpoint,
      scopes: discovery.scopes_supported || ['openid', 'profile', 'email'],
    };
  }

  // ---------------------------------------------------------------------------
  // Authorization Flow
  // ---------------------------------------------------------------------------

  async buildAuthorizationUrl(
    config: OidcConfiguration,
    redirectPath?: string
  ): Promise<{ url: string; state: string }> {
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');

    const authState: AuthorizationState = {
      nonce,
      redirectUri: config.redirectUri,
      organizationId: config.organizationId,
      createdAt: new Date(),
    };

    // Build URL parameters
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state,
      nonce,
    });

    // Add PKCE if enabled
    if (config.pkceEnabled) {
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      authState.codeVerifier = codeVerifier;

      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    // Store state for validation
    this.stateStore.set(state, authState);

    const url = `${config.authorizationEndpoint}?${params.toString()}`;

    return { url, state };
  }

  async handleCallback(
    config: OidcConfiguration,
    code: string,
    state: string
  ): Promise<OidcAuthResult> {
    // Validate state
    const authState = this.stateStore.get(state);
    if (!authState) {
      return {
        success: false,
        error: 'Invalid or expired state parameter',
      };
    }

    // Remove used state
    this.stateStore.delete(state);

    // Check state age (max 10 minutes)
    const stateAge = Date.now() - authState.createdAt.getTime();
    if (stateAge > 10 * 60 * 1000) {
      return {
        success: false,
        error: 'State has expired',
      };
    }

    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCode(config, code, authState.codeVerifier);

      // Validate ID token
      const idTokenClaims = this.parseIdToken(tokens.idToken);

      // Validate nonce if enabled
      if (config.noncesEnabled && idTokenClaims.nonce !== authState.nonce) {
        return {
          success: false,
          error: 'Invalid nonce in ID token',
        };
      }

      // Fetch user info
      const userInfo = await this.fetchUserInfo(config, tokens.accessToken);

      // Map to user
      const user = this.mapUserInfo(userInfo, config.claimMapping);

      return {
        success: true,
        user,
        tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${(error as Error).message}`,
      };
    }
  }

  private async exchangeCode(
    config: OidcConfiguration,
    code: string,
    codeVerifier?: string
  ): Promise<OidcTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      scope: data.scope,
    };
  }

  private parseIdToken(idToken: string): Record<string, unknown> {
    // JWT format: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format');
    }

    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  }

  private async fetchUserInfo(
    config: OidcConfiguration,
    accessToken: string
  ): Promise<OidcUserInfo> {
    const response = await fetch(config.userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }

    return response.json();
  }

  private mapUserInfo(
    userInfo: OidcUserInfo,
    mapping: OidcClaimMapping
  ): OidcAuthResult['user'] {
    const getClaim = (key: string): string | undefined => {
      const value = userInfo[key];
      return typeof value === 'string' ? value : undefined;
    };

    const getClaimArray = (key: string): string[] | undefined => {
      const value = userInfo[key];
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string');
      }
      return undefined;
    };

    return {
      email: getClaim(mapping.email) || userInfo.email || '',
      firstName: getClaim(mapping.firstName) || userInfo.givenName,
      lastName: getClaim(mapping.lastName) || userInfo.familyName,
      displayName: getClaim(mapping.displayName) || userInfo.name,
      picture: getClaim(mapping.picture) || userInfo.picture,
      groups: getClaimArray(mapping.groups || 'groups') || userInfo.groups,
      roles: getClaimArray(mapping.roles || 'roles') || userInfo.roles,
      externalId: userInfo.sub,
    };
  }

  // ---------------------------------------------------------------------------
  // Token Refresh
  // ---------------------------------------------------------------------------

  async refreshTokens(
    config: OidcConfiguration,
    refreshToken: string
  ): Promise<OidcTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token || refreshToken,
      idToken: data.id_token,
      scope: data.scope,
    };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  buildLogoutUrl(config: OidcConfiguration, idTokenHint?: string): string | null {
    if (!config.endSessionEndpoint) {
      return null;
    }

    const params = new URLSearchParams();

    if (idTokenHint) {
      params.set('id_token_hint', idTokenHint);
    }

    if (config.postLogoutRedirectUri) {
      params.set('post_logout_redirect_uri', config.postLogoutRedirectUri);
    }

    return `${config.endSessionEndpoint}?${params.toString()}`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private cleanupStates(): void {
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const [state, authState] of this.stateStore) {
      if (now - authState.createdAt.getTime() > maxAge) {
        this.stateStore.delete(state);
      }
    }
  }

  private mapToOidcConfiguration(record: {
    id: string;
    organizationId: string;
    providerType: string;
    enabled: boolean;
    configuration: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): OidcConfiguration {
    const config = record.configuration as Record<string, unknown>;

    return {
      id: record.id,
      organizationId: record.organizationId,
      providerType: 'OIDC',
      enabled: record.enabled,
      issuer: config.issuer as string,
      authorizationEndpoint: config.authorizationEndpoint as string,
      tokenEndpoint: config.tokenEndpoint as string,
      userinfoEndpoint: config.userinfoEndpoint as string,
      jwksUri: config.jwksUri as string,
      endSessionEndpoint: config.endSessionEndpoint as string | undefined,
      clientId: config.clientId as string,
      clientSecret: config.clientSecret as string,
      redirectUri: config.redirectUri as string,
      postLogoutRedirectUri: config.postLogoutRedirectUri as string | undefined,
      scopes: config.scopes as string[],
      claimMapping: config.claimMapping as OidcClaimMapping,
      pkceEnabled: config.pkceEnabled as boolean,
      noncesEnabled: config.noncesEnabled as boolean,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
