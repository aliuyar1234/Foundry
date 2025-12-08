/**
 * OAuth 2.0 Provider Service
 * SCALE Tier - Tasks T058-T063
 *
 * Implements OAuth 2.0 authorization code flow for partner API
 */

import { PrismaClient, PartnerApplication, ApiToken } from '@prisma/client';
import crypto from 'crypto';
import { PartnerService, PartnerScope } from './partnerService';
import { AppError } from '../../lib/errors/AppError';

export interface OAuthProviderConfig {
  prisma: PrismaClient;
  partnerService: PartnerService;
  tokenExpiryHours?: number;
  refreshTokenExpiryDays?: number;
  authCodeExpiryMinutes?: number;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  entityId: string;
  scopes: string[];
  redirectUri: string;
  expiresAt: Date;
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 'S256';
}

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export class OAuthProvider {
  private prisma: PrismaClient;
  private partnerService: PartnerService;
  private tokenExpiryHours: number;
  private refreshTokenExpiryDays: number;
  private authCodeExpiryMinutes: number;

  // In-memory store for auth codes (in production, use Redis)
  private authCodes = new Map<string, AuthorizationCode>();

  constructor(config: OAuthProviderConfig) {
    this.prisma = config.prisma;
    this.partnerService = config.partnerService;
    this.tokenExpiryHours = config.tokenExpiryHours || 1;
    this.refreshTokenExpiryDays = config.refreshTokenExpiryDays || 30;
    this.authCodeExpiryMinutes = config.authCodeExpiryMinutes || 10;
  }

  // ==========================================================================
  // T060: Authorization Code Flow
  // ==========================================================================

  /**
   * Generate authorization code
   */
  async generateAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    userId: string;
    entityId: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'plain' | 'S256';
    state?: string;
  }): Promise<{ code: string; state?: string }> {
    const { clientId, redirectUri, scopes, userId, entityId, codeChallenge, codeChallengeMethod, state } = params;

    // Verify client
    const app = await this.partnerService.getByClientId(clientId);
    if (!app) {
      throw new AppError('INVALID_CLIENT', 'Unknown client ID');
    }

    if (!app.isActive) {
      throw new AppError('CLIENT_INACTIVE', 'Partner application is inactive');
    }

    // Validate redirect URI
    if (!this.partnerService.matchRedirectUri(app.redirectUris, redirectUri)) {
      throw new AppError('INVALID_REDIRECT_URI', 'Redirect URI not registered');
    }

    // T063: Validate scopes
    this.validateScopes(scopes, app.scopes);

    // Generate code
    const code = this.generateSecureCode();
    const expiresAt = new Date(Date.now() + this.authCodeExpiryMinutes * 60 * 1000);

    // Store authorization code
    const authCode: AuthorizationCode = {
      code,
      clientId,
      userId,
      entityId,
      scopes,
      redirectUri,
      expiresAt,
      codeChallenge,
      codeChallengeMethod,
    };

    this.authCodes.set(code, authCode);

    // Clean up expired codes
    this.cleanupExpiredCodes();

    return { code, state };
  }

  // ==========================================================================
  // T061: Token Exchange
  // ==========================================================================

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<TokenResponse> {
    const { code, clientId, clientSecret, redirectUri, codeVerifier } = params;

    // Validate client credentials
    const app = await this.partnerService.validateCredentials(clientId, clientSecret);
    if (!app) {
      throw new AppError('INVALID_CLIENT', 'Invalid client credentials');
    }

    // Get and validate authorization code
    const authCode = this.authCodes.get(code);
    if (!authCode) {
      throw new AppError('INVALID_CODE', 'Invalid or expired authorization code');
    }

    // Verify code belongs to this client
    if (authCode.clientId !== clientId) {
      throw new AppError('INVALID_CODE', 'Authorization code was not issued to this client');
    }

    // Verify redirect URI
    if (authCode.redirectUri !== redirectUri) {
      throw new AppError('INVALID_REDIRECT_URI', 'Redirect URI mismatch');
    }

    // Verify code not expired
    if (new Date() > authCode.expiresAt) {
      this.authCodes.delete(code);
      throw new AppError('EXPIRED_CODE', 'Authorization code has expired');
    }

    // Verify PKCE code verifier if code challenge was provided
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        throw new AppError('INVALID_VERIFIER', 'Code verifier required');
      }

      const valid = this.verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'plain'
      );

      if (!valid) {
        throw new AppError('INVALID_VERIFIER', 'Code verifier validation failed');
      }
    }

    // Consume the code (one-time use)
    this.authCodes.delete(code);

    // Generate tokens
    return this.generateTokens(app, authCode.userId, authCode.entityId, authCode.scopes);
  }

  // ==========================================================================
  // T062: Token Refresh
  // ==========================================================================

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[];
  }): Promise<TokenResponse> {
    const { refreshToken, clientId, clientSecret, scopes } = params;

    // Validate client credentials
    const app = await this.partnerService.validateCredentials(clientId, clientSecret);
    if (!app) {
      throw new AppError('INVALID_CLIENT', 'Invalid client credentials');
    }

    // Find token by refresh token hash
    const refreshTokenHash = this.hashToken(refreshToken);
    const existingToken = await this.prisma.apiToken.findUnique({
      where: { refreshTokenHash },
    });

    if (!existingToken) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    if (existingToken.applicationId !== app.id) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token was not issued to this client');
    }

    if (existingToken.revokedAt) {
      throw new AppError('TOKEN_REVOKED', 'Token has been revoked');
    }

    // Check if refresh token is expired (30 days from creation)
    const refreshExpiry = new Date(existingToken.createdAt);
    refreshExpiry.setDate(refreshExpiry.getDate() + this.refreshTokenExpiryDays);
    if (new Date() > refreshExpiry) {
      throw new AppError('EXPIRED_REFRESH_TOKEN', 'Refresh token has expired');
    }

    // Validate requested scopes (must be subset of original)
    const requestedScopes = scopes || existingToken.scopes;
    const invalidScopes = requestedScopes.filter(s => !existingToken.scopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new AppError(
        'INVALID_SCOPES',
        `Requested scopes exceed original authorization: ${invalidScopes.join(', ')}`
      );
    }

    // Revoke old token
    await this.prisma.apiToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    return this.generateTokens(app, existingToken.userId, existingToken.entityId, requestedScopes);
  }

  /**
   * Revoke a token
   */
  async revokeToken(params: {
    token: string;
    tokenTypeHint?: 'access_token' | 'refresh_token';
    clientId: string;
    clientSecret: string;
  }): Promise<void> {
    const { token, clientId, clientSecret } = params;

    // Validate client credentials
    const app = await this.partnerService.validateCredentials(clientId, clientSecret);
    if (!app) {
      throw new AppError('INVALID_CLIENT', 'Invalid client credentials');
    }

    const tokenHash = this.hashToken(token);

    // Try to find as access token
    let existingToken = await this.prisma.apiToken.findUnique({
      where: { accessTokenHash: tokenHash },
    });

    // Try as refresh token if not found
    if (!existingToken) {
      existingToken = await this.prisma.apiToken.findUnique({
        where: { refreshTokenHash: tokenHash },
      });
    }

    if (existingToken && existingToken.applicationId === app.id) {
      await this.prisma.apiToken.update({
        where: { id: existingToken.id },
        data: { revokedAt: new Date() },
      });
    }

    // Per OAuth spec, always return success even if token not found
  }

  // ==========================================================================
  // T063: Scope Validation
  // ==========================================================================

  /**
   * Validate requested scopes against allowed scopes
   */
  validateScopes(requestedScopes: string[], allowedScopes: string[]): void {
    if (requestedScopes.length === 0) {
      throw new AppError('INVALID_SCOPES', 'At least one scope is required');
    }

    const invalid = requestedScopes.filter(s => !allowedScopes.includes(s));
    if (invalid.length > 0) {
      throw new AppError(
        'INVALID_SCOPES',
        `Requested scopes not authorized: ${invalid.join(', ')}`
      );
    }
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token: string): Promise<{
    application: PartnerApplication;
    userId: string;
    entityId: string;
    scopes: string[];
  } | null> {
    const tokenHash = this.hashToken(token);

    const apiToken = await this.prisma.apiToken.findUnique({
      where: { accessTokenHash: tokenHash },
      include: { application: true },
    });

    if (!apiToken) return null;

    if (apiToken.revokedAt) return null;

    if (new Date() > apiToken.expiresAt) return null;

    if (!apiToken.application.isActive) return null;

    // Update last used
    await this.prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      application: apiToken.application,
      userId: apiToken.userId,
      entityId: apiToken.entityId,
      scopes: apiToken.scopes,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Generate tokens and store in database
   */
  private async generateTokens(
    app: PartnerApplication,
    userId: string,
    entityId: string,
    scopes: string[]
  ): Promise<TokenResponse> {
    const accessToken = this.generateSecureToken();
    const refreshToken = this.generateSecureToken();

    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

    await this.prisma.apiToken.create({
      data: {
        applicationId: app.id,
        userId,
        entityId,
        accessTokenHash: this.hashToken(accessToken),
        refreshTokenHash: this.hashToken(refreshToken),
        scopes,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.tokenExpiryHours * 60 * 60,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  /**
   * Generate secure random code
   */
  private generateSecureCode(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate secure random token
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Verify PKCE code challenge
   */
  private verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: 'plain' | 'S256'
  ): boolean {
    if (method === 'plain') {
      return verifier === challenge;
    }

    // S256: BASE64URL(SHA256(verifier))
    const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
    return hash === challenge;
  }

  /**
   * Clean up expired authorization codes
   */
  private cleanupExpiredCodes(): void {
    const now = new Date();
    for (const [code, authCode] of this.authCodes.entries()) {
      if (now > authCode.expiresAt) {
        this.authCodes.delete(code);
      }
    }
  }
}
