/**
 * API Request Signing Service
 *
 * Implements HMAC-based request signing for partner API security.
 * Partners must sign requests with their secret key.
 *
 * Signature format: HMAC-SHA256(method + path + timestamp + body, secretKey)
 */

import crypto from 'crypto';
import { prisma } from '../../db/prisma';

export interface SignedRequest {
  method: string;
  path: string;
  timestamp: string;
  body?: string;
  signature: string;
  apiKeyId: string;
}

export interface SignatureValidationResult {
  valid: boolean;
  error?: string;
  apiKey?: {
    id: string;
    entityId: string;
    partnerId: string;
    permissions: string[];
  };
}

const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const ALGORITHM = 'sha256';

export class ApiSigningService {
  /**
   * Generate signature for a request
   */
  generateSignature(
    secretKey: string,
    method: string,
    path: string,
    timestamp: string,
    body?: string
  ): string {
    const payload = this.buildSignaturePayload(method, path, timestamp, body);
    return this.hmacSign(payload, secretKey);
  }

  /**
   * Validate a signed request
   */
  async validateSignature(request: SignedRequest): Promise<SignatureValidationResult> {
    // Check timestamp freshness
    const requestTime = parseInt(request.timestamp, 10);
    const now = Date.now();

    if (isNaN(requestTime)) {
      return { valid: false, error: 'Invalid timestamp format' };
    }

    if (Math.abs(now - requestTime) > SIGNATURE_EXPIRY_MS) {
      return { valid: false, error: 'Request timestamp expired' };
    }

    // Fetch API key and secret
    const apiKey = await prisma.partnerApiKey.findUnique({
      where: { id: request.apiKeyId },
      include: {
        partner: {
          select: {
            id: true,
            entityId: true,
            status: true,
          },
        },
      },
    });

    if (!apiKey) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (apiKey.status !== 'ACTIVE') {
      return { valid: false, error: 'API key is not active' };
    }

    if (apiKey.partner.status !== 'ACTIVE') {
      return { valid: false, error: 'Partner account is not active' };
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    // Generate expected signature
    const expectedSignature = this.generateSignature(
      apiKey.secretKeyHash, // In production, store hashed and use constant-time compare
      request.method,
      request.path,
      request.timestamp,
      request.body
    );

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(request.signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Update last used timestamp
    await prisma.partnerApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      valid: true,
      apiKey: {
        id: apiKey.id,
        entityId: apiKey.partner.entityId,
        partnerId: apiKey.partner.id,
        permissions: apiKey.permissions,
      },
    };
  }

  /**
   * Build the payload string for signing
   */
  private buildSignaturePayload(
    method: string,
    path: string,
    timestamp: string,
    body?: string
  ): string {
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
    ];

    if (body) {
      // Hash the body to handle large payloads
      const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
      parts.push(bodyHash);
    }

    return parts.join('\n');
  }

  /**
   * Create HMAC signature
   */
  private hmacSign(payload: string, secretKey: string): string {
    return crypto
      .createHmac(ALGORITHM, secretKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Generate a new API key pair
   */
  generateApiKeyPair(): { keyId: string; secretKey: string } {
    const keyId = `pk_${crypto.randomBytes(16).toString('hex')}`;
    const secretKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

    return { keyId, secretKey };
  }

  /**
   * Hash secret key for storage
   */
  hashSecretKey(secretKey: string): string {
    return crypto.createHash('sha256').update(secretKey).digest('hex');
  }
}

export const apiSigningService = new ApiSigningService();
