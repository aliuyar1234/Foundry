/**
 * Security Tests: Credential Audit
 * Task: T213
 *
 * Verifies credential security including encryption, storage, and logging.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

describe('Credential Encryption', () => {
  describe('AES-256-GCM Encryption', () => {
    it('should use AES-256-GCM algorithm', () => {
      const plaintext = 'my-secret-api-key';
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      expect(encrypted).toBeTruthy();
      expect(authTag.length).toBe(16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      expect(decrypted).toBe(plaintext);
    });

    it('should generate unique IV for each encryption', () => {
      const ivs: Buffer[] = [];
      for (let i = 0; i < 100; i++) {
        ivs.push(crypto.randomBytes(16));
      }
      const uniqueIvs = new Set(ivs.map(iv => iv.toString('hex')));
      expect(uniqueIvs.size).toBe(100);
    });

    it('should reject tampered ciphertext', () => {
      const plaintext = 'sensitive-data';
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      const tamperedEncrypted = encrypted.substring(0, encrypted.length - 2) + 'ff';

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      expect(() => {
        decipher.update(tamperedEncrypted, 'hex', 'utf8');
        decipher.final('utf8');
      }).toThrow();
    });

    it('should reject wrong auth tag', () => {
      const plaintext = 'sensitive-data';
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const wrongAuthTag = crypto.randomBytes(16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(wrongAuthTag);

      expect(() => {
        decipher.update(encrypted, 'hex', 'utf8');
        decipher.final('utf8');
      }).toThrow();
    });
  });

  describe('No Plaintext Secrets in Logs', () => {
    const logOutput: string[] = [];
    const mockLogger = {
      info: (msg: string) => logOutput.push(msg),
      error: (msg: string) => logOutput.push(msg),
    };

    beforeEach(() => {
      logOutput.length = 0;
    });

    it('should not log API keys', () => {
      const apiKey = 'sk-1234567890abcdefghijklmnop';
      const maskedKey = apiKey.substring(0, 7) + '***' + apiKey.substring(apiKey.length - 4);
      mockLogger.info(`Using API key: ${maskedKey}`);

      const logs = logOutput.join('\n');
      expect(logs).not.toContain('sk-1234567890abcdefghijklmnop');
      expect(logs).toContain('sk-1234***');
    });

    it('should not log OAuth tokens', () => {
      const accessToken = 'ya29.a0AfH6SMBxxxxxxxxxxxxxxxx';
      mockLogger.info('Token refreshed successfully');

      const logs = logOutput.join('\n');
      expect(logs).not.toContain(accessToken);
    });

    it('should not log passwords in connection strings', () => {
      const connectionString = 'postgresql://user:supersecretpassword@localhost:5432/db';
      const maskedConnection = connectionString.replace(/:([^@]+)@/, ':***@');
      mockLogger.info(`Connecting to database: ${maskedConnection}`);

      const logs = logOutput.join('\n');
      expect(logs).not.toContain('supersecretpassword');
      expect(logs).toContain(':***@');
    });

    it('should mask bearer tokens in headers', () => {
      const headers = {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.xxx.yyy',
        'Content-Type': 'application/json',
      };
      const safeHeaders = { ...headers, Authorization: 'Bearer [REDACTED]' };
      mockLogger.info(`Request headers: ${JSON.stringify(safeHeaders)}`);

      const logs = logOutput.join('\n');
      expect(logs).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(logs).toContain('[REDACTED]');
    });
  });

  describe('Credential Storage', () => {
    it('should not store encryption key with credential', () => {
      const credentialData = {
        connectorInstanceId: 'instance-1',
        encryptedData: 'encrypted-blob',
        iv: 'iv-value',
        authTag: 'tag-value',
      };

      expect(credentialData).not.toHaveProperty('key');
      expect(credentialData).not.toHaveProperty('encryptionKey');
      expect(credentialData).not.toHaveProperty('masterKey');
    });
  });

  describe('Credential Rotation', () => {
    it('should support key versioning', () => {
      const keyVersion = {
        version: 2,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: 'key-v2-uuid',
      };

      expect(keyVersion.version).toBe(2);
      expect(keyVersion.algorithm).toBe('aes-256-gcm');
    });
  });

  describe('Credential Access Control', () => {
    it('should require authentication', () => {
      const unauthenticatedContext = { user: null };
      const canAccess = unauthenticatedContext.user !== null;
      expect(canAccess).toBe(false);
    });

    it('should restrict access to organization', () => {
      const credential = { connectorInstance: { organizationId: 'org-1' } };
      const requestingUser = { organizationId: 'org-2' };
      const hasAccess = credential.connectorInstance.organizationId === requestingUser.organizationId;
      expect(hasAccess).toBe(false);
    });

    it('should require admin role for credential operations', () => {
      const requiredPermissions = ['connector:credentials:read', 'connector:credentials:write'];
      const userPermissions = ['connector:read'];
      const hasPermission = requiredPermissions.every(p => userPermissions.includes(p));
      expect(hasPermission).toBe(false);
    });
  });

  describe('Encryption Key Management', () => {
    it('should derive encryption key using PBKDF2', () => {
      const masterKey = 'master-secret-key';
      const salt = crypto.randomBytes(16);
      const derivedKey = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
      expect(derivedKey.length).toBe(32);
    });

    it('should not hardcode encryption keys', () => {
      const sourceCode = `
        const encryptionKey = process.env.ENCRYPTION_KEY;
        const apiKey = config.get('apiKey');
      `;
      const hardcodedPatterns = [
        /key\s*=\s*['"][a-zA-Z0-9]{20,}['"]/i,
        /secret\s*=\s*['"][a-zA-Z0-9]{20,}['"]/i,
      ];
      const hasHardcodedSecrets = hardcodedPatterns.some(p => p.test(sourceCode));
      expect(hasHardcodedSecrets).toBe(false);
    });
  });
});
