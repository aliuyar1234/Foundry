/**
 * OAuth Token Manager
 * Task: T005
 *
 * Manages OAuth tokens with Redis caching for all OAuth-based connectors.
 * Handles token storage, retrieval, refresh, and expiration.
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
  idToken?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenRefreshResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

export type TokenRefreshCallback = (
  refreshToken: string
) => Promise<TokenRefreshResult>;

interface CachedTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  tokenType: string;
  scope?: string;
  idToken?: string;
  metadata?: Record<string, unknown>;
}

export class OAuthTokenManager {
  private redis: Redis | null;
  private localCache: Map<string, CachedTokenData> = new Map();
  private refreshCallbacks: Map<string, TokenRefreshCallback> = new Map();
  private keyPrefix: string;
  private encryptionKey: Buffer;
  private refreshLocks: Map<string, Promise<TokenRefreshResult>> = new Map();

  constructor(
    redis: Redis | null,
    options: {
      keyPrefix?: string;
      encryptionKey?: string;
    } = {}
  ) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'oauth:tokens';
    this.encryptionKey = this.deriveKey(
      options.encryptionKey || process.env.TOKEN_ENCRYPTION_KEY || 'default-key'
    );
  }

  /**
   * Register a refresh callback for a specific connector type
   */
  registerRefreshCallback(
    connectorType: string,
    callback: TokenRefreshCallback
  ): void {
    this.refreshCallbacks.set(connectorType, callback);
  }

  /**
   * Store OAuth tokens
   */
  async storeTokens(
    connectorType: string,
    instanceId: string,
    tokens: OAuthTokens
  ): Promise<void> {
    const key = this.getKey(connectorType, instanceId);
    const data: CachedTokenData = {
      accessToken: this.encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken
        ? this.encrypt(tokens.refreshToken)
        : undefined,
      expiresAt: tokens.expiresAt.toISOString(),
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      idToken: tokens.idToken ? this.encrypt(tokens.idToken) : undefined,
      metadata: tokens.metadata,
    };

    if (this.redis) {
      // Calculate TTL based on expiration, add some buffer
      const ttl = Math.max(
        Math.ceil((tokens.expiresAt.getTime() - Date.now()) / 1000) + 3600,
        7200 // Minimum 2 hours TTL
      );
      await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
    } else {
      this.localCache.set(key, data);
    }
  }

  /**
   * Get OAuth tokens
   */
  async getTokens(
    connectorType: string,
    instanceId: string
  ): Promise<OAuthTokens | null> {
    const key = this.getKey(connectorType, instanceId);
    let data: CachedTokenData | null = null;

    if (this.redis) {
      const cached = await this.redis.get(key);
      if (cached) {
        data = JSON.parse(cached);
      }
    } else {
      data = this.localCache.get(key) || null;
    }

    if (!data) {
      return null;
    }

    return {
      accessToken: this.decrypt(data.accessToken),
      refreshToken: data.refreshToken
        ? this.decrypt(data.refreshToken)
        : undefined,
      expiresAt: new Date(data.expiresAt),
      tokenType: data.tokenType,
      scope: data.scope,
      idToken: data.idToken ? this.decrypt(data.idToken) : undefined,
      metadata: data.metadata,
    };
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(
    connectorType: string,
    instanceId: string
  ): Promise<string | null> {
    const tokens = await this.getTokens(connectorType, instanceId);

    if (!tokens) {
      return null;
    }

    // Check if token is still valid (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000;
    if (tokens.expiresAt.getTime() > Date.now() + bufferMs) {
      return tokens.accessToken;
    }

    // Token is expired or about to expire, try to refresh
    if (tokens.refreshToken) {
      const refreshResult = await this.refreshTokens(
        connectorType,
        instanceId,
        tokens.refreshToken
      );
      if (refreshResult.success && refreshResult.tokens) {
        return refreshResult.tokens.accessToken;
      }
    }

    return null;
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(
    connectorType: string,
    instanceId: string,
    refreshToken: string
  ): Promise<TokenRefreshResult> {
    const lockKey = `${connectorType}:${instanceId}`;

    // Check if refresh is already in progress
    const existingRefresh = this.refreshLocks.get(lockKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    const callback = this.refreshCallbacks.get(connectorType);
    if (!callback) {
      return {
        success: false,
        error: `No refresh callback registered for connector type: ${connectorType}`,
      };
    }

    // Create refresh promise and store it
    const refreshPromise = (async () => {
      try {
        const result = await callback(refreshToken);

        if (result.success && result.tokens) {
          await this.storeTokens(connectorType, instanceId, result.tokens);
        }

        return result;
      } finally {
        this.refreshLocks.delete(lockKey);
      }
    })();

    this.refreshLocks.set(lockKey, refreshPromise);
    return refreshPromise;
  }

  /**
   * Delete stored tokens
   */
  async deleteTokens(
    connectorType: string,
    instanceId: string
  ): Promise<void> {
    const key = this.getKey(connectorType, instanceId);

    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.localCache.delete(key);
    }
  }

  /**
   * Check if tokens exist for a connector instance
   */
  async hasTokens(
    connectorType: string,
    instanceId: string
  ): Promise<boolean> {
    const key = this.getKey(connectorType, instanceId);

    if (this.redis) {
      const exists = await this.redis.exists(key);
      return exists === 1;
    }

    return this.localCache.has(key);
  }

  /**
   * Check if access token is valid (not expired)
   */
  async isTokenValid(
    connectorType: string,
    instanceId: string,
    bufferMs: number = 5 * 60 * 1000
  ): Promise<boolean> {
    const tokens = await this.getTokens(connectorType, instanceId);

    if (!tokens) {
      return false;
    }

    return tokens.expiresAt.getTime() > Date.now() + bufferMs;
  }

  /**
   * Get token expiration time
   */
  async getTokenExpiration(
    connectorType: string,
    instanceId: string
  ): Promise<Date | null> {
    const tokens = await this.getTokens(connectorType, instanceId);
    return tokens?.expiresAt || null;
  }

  /**
   * Update token metadata
   */
  async updateMetadata(
    connectorType: string,
    instanceId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const tokens = await this.getTokens(connectorType, instanceId);

    if (tokens) {
      tokens.metadata = { ...tokens.metadata, ...metadata };
      await this.storeTokens(connectorType, instanceId, tokens);
    }
  }

  // Private methods

  private getKey(connectorType: string, instanceId: string): string {
    return `${this.keyPrefix}:${connectorType}:${instanceId}`;
  }

  private deriveKey(secret: string): Buffer {
    return crypto.scryptSync(secret, 'oauth-token-salt', 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

/**
 * Create a singleton instance of the token manager
 */
let tokenManagerInstance: OAuthTokenManager | null = null;

export function getOAuthTokenManager(redis?: Redis | null): OAuthTokenManager {
  if (!tokenManagerInstance) {
    tokenManagerInstance = new OAuthTokenManager(redis || null);
  }
  return tokenManagerInstance;
}

/**
 * OAuth state management for CSRF protection
 */
export class OAuthStateManager {
  private redis: Redis | null;
  private localState: Map<string, { data: string; expiresAt: number }> =
    new Map();
  private keyPrefix: string;
  private stateTTL: number;

  constructor(
    redis: Redis | null,
    options: {
      keyPrefix?: string;
      stateTTL?: number; // seconds
    } = {}
  ) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'oauth:state';
    this.stateTTL = options.stateTTL || 600; // 10 minutes default
  }

  /**
   * Generate and store OAuth state
   */
  async generateState(data?: Record<string, unknown>): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    const key = `${this.keyPrefix}:${state}`;
    const payload = JSON.stringify(data || {});

    if (this.redis) {
      await this.redis.set(key, payload, 'EX', this.stateTTL);
    } else {
      this.localState.set(key, {
        data: payload,
        expiresAt: Date.now() + this.stateTTL * 1000,
      });
    }

    return state;
  }

  /**
   * Validate and retrieve OAuth state data
   */
  async validateState(state: string): Promise<{
    valid: boolean;
    data?: Record<string, unknown>;
  }> {
    const key = `${this.keyPrefix}:${state}`;
    let payload: string | null = null;

    if (this.redis) {
      payload = await this.redis.get(key);
      if (payload) {
        await this.redis.del(key); // One-time use
      }
    } else {
      const cached = this.localState.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        payload = cached.data;
        this.localState.delete(key);
      }
    }

    if (!payload) {
      return { valid: false };
    }

    return {
      valid: true,
      data: JSON.parse(payload),
    };
  }

  /**
   * Clean up expired local state entries
   */
  cleanupExpiredState(): void {
    if (!this.redis) {
      const now = Date.now();
      for (const [key, value] of this.localState) {
        if (value.expiresAt <= now) {
          this.localState.delete(key);
        }
      }
    }
  }
}
