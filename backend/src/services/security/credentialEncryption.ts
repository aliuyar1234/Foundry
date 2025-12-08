/**
 * Credential Encryption Service
 * Task: T006
 *
 * Implements secure credential storage using AES-256-GCM encryption.
 * Provides encryption, decryption, and key management for connector credentials.
 */

import crypto from 'crypto';
import { Redis } from 'ioredis';

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
  keyId: string;
  version: number;
}

export interface CredentialMetadata {
  connectorType: string;
  instanceId: string;
  credentialType: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface StoredCredential {
  encrypted: EncryptedCredential;
  metadata: CredentialMetadata;
}

interface KeyInfo {
  key: Buffer;
  version: number;
  createdAt: Date;
}

export class CredentialEncryptionService {
  private readonly algorithm = 'aes-256-gcm' as const;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly keyPrefix: string;
  private redis: Redis | null;
  private localStore: Map<string, StoredCredential> = new Map();
  private keyCache: Map<string, KeyInfo> = new Map();
  private masterKey: Buffer;

  constructor(
    redis: Redis | null,
    options: {
      keyPrefix?: string;
      masterKey?: string;
    } = {}
  ) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'creds';

    // SECURITY: Derive master key from provided options or environment
    const masterKeySource =
      options.masterKey ||
      process.env.CREDENTIAL_MASTER_KEY ||
      process.env.TOKEN_ENCRYPTION_KEY;

    // SECURITY: Reject missing or default keys in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (!masterKeySource) {
      if (isProduction) {
        throw new Error(
          'SECURITY ERROR: CREDENTIAL_MASTER_KEY or TOKEN_ENCRYPTION_KEY must be set in production. ' +
          'Generate a secure key: openssl rand -hex 32'
        );
      }
      // Development fallback with warning
      console.warn(
        '[SECURITY WARNING] Using default master key - set CREDENTIAL_MASTER_KEY in production!'
      );
      this.masterKey = this.deriveMasterKey('default-dev-key-NOT-FOR-PRODUCTION');
    } else {
      // Validate key strength in production
      if (isProduction) {
        const validation = CredentialEncryptionService.validateMasterKey(masterKeySource);
        if (!validation.valid) {
          throw new Error(
            `SECURITY ERROR: Master key validation failed: ${validation.issues.join(', ')}`
          );
        }
      }
      this.masterKey = this.deriveMasterKey(masterKeySource);
    }
  }

  /**
   * Derive master key from secret
   */
  private deriveMasterKey(secret: string): Buffer {
    return crypto.scryptSync(secret, 'credential-encryption-salt', 32);
  }

  /**
   * Generate a new data encryption key (DEK)
   */
  private generateDEK(): { key: Buffer; keyId: string } {
    const key = crypto.randomBytes(32);
    const keyId = crypto.randomBytes(16).toString('hex');
    return { key, keyId };
  }

  /**
   * Encrypt DEK with master key for storage
   */
  private encryptDEK(dek: Buffer): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(dek);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt DEK using master key
   */
  private decryptDEK(encryptedDEK: string): Buffer {
    const parts = encryptedDEK.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted DEK format');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }

  /**
   * Encrypt credential data
   */
  encrypt(data: Record<string, unknown>, keyId?: string): EncryptedCredential {
    let key: Buffer;
    let actualKeyId: string;
    let version = 1;

    if (keyId && this.keyCache.has(keyId)) {
      const keyInfo = this.keyCache.get(keyId)!;
      key = keyInfo.key;
      actualKeyId = keyId;
      version = keyInfo.version;
    } else {
      const newKey = this.generateDEK();
      key = newKey.key;
      actualKeyId = newKey.keyId;
      this.keyCache.set(actualKeyId, {
        key,
        version: 1,
        createdAt: new Date(),
      });
    }

    const plaintext = JSON.stringify(data);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm,
      keyId: actualKeyId,
      version,
    };
  }

  /**
   * Decrypt credential data
   */
  decrypt(encrypted: EncryptedCredential): Record<string, unknown> {
    const keyInfo = this.keyCache.get(encrypted.keyId);
    if (!keyInfo) {
      throw new Error(`Encryption key not found: ${encrypted.keyId}`);
    }

    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, keyInfo.key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return JSON.parse(plaintext);
  }

  /**
   * Store encrypted credential
   */
  async storeCredential(
    connectorType: string,
    instanceId: string,
    credentialType: string,
    data: Record<string, unknown>,
    expiresAt?: Date
  ): Promise<void> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);
    const encrypted = this.encrypt(data);
    const now = new Date();

    const stored: StoredCredential = {
      encrypted,
      metadata: {
        connectorType,
        instanceId,
        credentialType,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      },
    };

    if (this.redis) {
      const ttl = expiresAt
        ? Math.ceil((expiresAt.getTime() - Date.now()) / 1000)
        : undefined;

      // Store the encrypted DEK separately
      const dekKey = `${this.keyPrefix}:dek:${encrypted.keyId}`;
      const keyInfo = this.keyCache.get(encrypted.keyId)!;
      const encryptedDEK = this.encryptDEK(keyInfo.key);

      await this.redis.set(dekKey, encryptedDEK);

      if (ttl && ttl > 0) {
        await this.redis.set(key, JSON.stringify(stored), 'EX', ttl);
      } else {
        await this.redis.set(key, JSON.stringify(stored));
      }
    } else {
      this.localStore.set(key, stored);
    }
  }

  /**
   * Retrieve and decrypt credential
   */
  async getCredential(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): Promise<Record<string, unknown> | null> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);
    let stored: StoredCredential | null = null;

    if (this.redis) {
      const data = await this.redis.get(key);
      if (data) {
        stored = JSON.parse(data);

        // Load DEK if not in cache
        if (stored && !this.keyCache.has(stored.encrypted.keyId)) {
          const dekKey = `${this.keyPrefix}:dek:${stored.encrypted.keyId}`;
          const encryptedDEK = await this.redis.get(dekKey);
          if (encryptedDEK) {
            const dek = this.decryptDEK(encryptedDEK);
            this.keyCache.set(stored.encrypted.keyId, {
              key: dek,
              version: stored.encrypted.version,
              createdAt: new Date(stored.metadata.createdAt),
            });
          }
        }
      }
    } else {
      stored = this.localStore.get(key) || null;
    }

    if (!stored) {
      return null;
    }

    // Check expiration
    if (
      stored.metadata.expiresAt &&
      new Date(stored.metadata.expiresAt) < new Date()
    ) {
      await this.deleteCredential(connectorType, instanceId, credentialType);
      return null;
    }

    return this.decrypt(stored.encrypted);
  }

  /**
   * Update credential
   */
  async updateCredential(
    connectorType: string,
    instanceId: string,
    credentialType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);
    let existingMetadata: CredentialMetadata | undefined;

    if (this.redis) {
      const existing = await this.redis.get(key);
      if (existing) {
        const parsed: StoredCredential = JSON.parse(existing);
        existingMetadata = parsed.metadata;
      }
    } else {
      const existing = this.localStore.get(key);
      if (existing) {
        existingMetadata = existing.metadata;
      }
    }

    await this.storeCredential(
      connectorType,
      instanceId,
      credentialType,
      data,
      existingMetadata?.expiresAt
        ? new Date(existingMetadata.expiresAt)
        : undefined
    );
  }

  /**
   * Delete credential
   */
  async deleteCredential(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): Promise<void> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);

    if (this.redis) {
      // Get the credential first to clean up DEK
      const data = await this.redis.get(key);
      if (data) {
        const stored: StoredCredential = JSON.parse(data);
        // Note: We don't delete the DEK as it might be shared
        // In production, implement DEK reference counting
      }
      await this.redis.del(key);
    } else {
      this.localStore.delete(key);
    }
  }

  /**
   * Delete all credentials for a connector instance
   */
  async deleteAllCredentials(
    connectorType: string,
    instanceId: string
  ): Promise<void> {
    const pattern = `${this.keyPrefix}:${connectorType}:${instanceId}:*`;

    if (this.redis) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } else {
      const prefix = `${this.keyPrefix}:${connectorType}:${instanceId}:`;
      for (const key of this.localStore.keys()) {
        if (key.startsWith(prefix)) {
          this.localStore.delete(key);
        }
      }
    }
  }

  /**
   * Check if credential exists
   */
  async hasCredential(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): Promise<boolean> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);

    if (this.redis) {
      const exists = await this.redis.exists(key);
      return exists === 1;
    }

    return this.localStore.has(key);
  }

  /**
   * Get credential metadata without decrypting
   */
  async getCredentialMetadata(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): Promise<CredentialMetadata | null> {
    const key = this.getStorageKey(connectorType, instanceId, credentialType);
    let stored: StoredCredential | null = null;

    if (this.redis) {
      const data = await this.redis.get(key);
      if (data) {
        stored = JSON.parse(data);
      }
    } else {
      stored = this.localStore.get(key) || null;
    }

    return stored?.metadata || null;
  }

  /**
   * List all credential types for a connector instance
   */
  async listCredentials(
    connectorType: string,
    instanceId: string
  ): Promise<string[]> {
    const pattern = `${this.keyPrefix}:${connectorType}:${instanceId}:`;
    const credentials: string[] = [];

    if (this.redis) {
      const keys = await this.redis.keys(`${pattern}*`);
      for (const key of keys) {
        const credType = key.substring(pattern.length);
        credentials.push(credType);
      }
    } else {
      for (const key of this.localStore.keys()) {
        if (key.startsWith(pattern)) {
          const credType = key.substring(pattern.length);
          credentials.push(credType);
        }
      }
    }

    return credentials;
  }

  /**
   * Rotate encryption key for a credential
   */
  async rotateKey(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): Promise<void> {
    const data = await this.getCredential(
      connectorType,
      instanceId,
      credentialType
    );

    if (!data) {
      throw new Error('Credential not found');
    }

    // Generate new key and re-encrypt
    const newKey = this.generateDEK();
    this.keyCache.set(newKey.keyId, {
      key: newKey.key,
      version: 1,
      createdAt: new Date(),
    });

    // Get metadata to preserve expiration
    const metadata = await this.getCredentialMetadata(
      connectorType,
      instanceId,
      credentialType
    );

    // Re-store with new encryption
    await this.storeCredential(
      connectorType,
      instanceId,
      credentialType,
      data,
      metadata?.expiresAt ? new Date(metadata.expiresAt) : undefined
    );
  }

  /**
   * Generate storage key
   */
  private getStorageKey(
    connectorType: string,
    instanceId: string,
    credentialType: string
  ): string {
    return `${this.keyPrefix}:${connectorType}:${instanceId}:${credentialType}`;
  }

  /**
   * Hash sensitive data for logging/debugging
   */
  hashForLogging(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
  }

  /**
   * Validate master key strength
   */
  static validateMasterKey(key: string): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (key.length < 32) {
      issues.push('Master key should be at least 32 characters');
    }

    if (!/[A-Z]/.test(key)) {
      issues.push('Master key should contain uppercase letters');
    }

    if (!/[a-z]/.test(key)) {
      issues.push('Master key should contain lowercase letters');
    }

    if (!/[0-9]/.test(key)) {
      issues.push('Master key should contain numbers');
    }

    if (!/[^A-Za-z0-9]/.test(key)) {
      issues.push('Master key should contain special characters');
    }

    if (key === 'default-master-key-change-in-production') {
      issues.push('Using default master key - change in production!');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

/**
 * Singleton instance
 */
let credentialServiceInstance: CredentialEncryptionService | null = null;

export function getCredentialEncryptionService(
  redis?: Redis | null
): CredentialEncryptionService {
  if (!credentialServiceInstance) {
    credentialServiceInstance = new CredentialEncryptionService(redis || null);
  }
  return credentialServiceInstance;
}

/**
 * Credential types enum for type safety
 */
export const CredentialTypes = {
  OAUTH_TOKENS: 'oauth_tokens',
  API_KEY: 'api_key',
  API_SECRET: 'api_secret',
  SESSION_TOKEN: 'session_token',
  USERNAME_PASSWORD: 'username_password',
  CERTIFICATE: 'certificate',
  SSH_KEY: 'ssh_key',
  SERVICE_ACCOUNT: 'service_account',
} as const;

export type CredentialType =
  (typeof CredentialTypes)[keyof typeof CredentialTypes];
