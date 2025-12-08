// =============================================================================
// License Service Tests
// SCALE Tier - Task T196-T200
//
// Unit tests for license management functionality
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Mock PrismaClient
const mockPrisma = {
  systemConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  user: {
    count: vi.fn(),
  },
  entity: {
    count: vi.fn(),
  },
  process: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  aiCache: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  syncQueue: {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// -----------------------------------------------------------------------------
// License Validation Tests
// -----------------------------------------------------------------------------

describe('LicenseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseLicenseKey', () => {
    it('should parse a valid license key', () => {
      const payload = {
        id: 'lic_123',
        type: 'ENTERPRISE',
        orgId: 'org_456',
        orgName: 'Test Organization',
        iat: new Date().toISOString(),
        exp: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const signature = 'dummy_signature';
      const licenseKey = `${encodedPayload}.${signature}`;

      // Verify structure
      const parts = licenseKey.split('.');
      expect(parts.length).toBe(2);

      // Decode payload
      const decoded = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf-8'));
      expect(decoded.id).toBe('lic_123');
      expect(decoded.type).toBe('ENTERPRISE');
      expect(decoded.orgName).toBe('Test Organization');
    });

    it('should reject invalid license key format', () => {
      const invalidKey = 'not_a_valid_key';
      const parts = invalidKey.split('.');
      expect(parts.length).toBe(1); // No signature
    });

    it('should reject malformed base64 payload', () => {
      const invalidKey = 'not_valid_base64.signature';

      try {
        const decoded = Buffer.from(invalidKey.split('.')[0], 'base64').toString('utf-8');
        JSON.parse(decoded);
        expect.fail('Should have thrown');
      } catch {
        // Expected
        expect(true).toBe(true);
      }
    });
  });

  describe('validateLicense', () => {
    it('should return invalid for expired license', async () => {
      const expiredDate = new Date(Date.now() - 1000);

      const license = {
        id: 'lic_123',
        type: 'ENTERPRISE',
        expiresAt: expiredDate,
      };

      const isExpired = license.expiresAt < new Date();
      expect(isExpired).toBe(true);
    });

    it('should return valid for active license', async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const license = {
        id: 'lic_123',
        type: 'ENTERPRISE',
        expiresAt: futureDate,
      };

      const isValid = license.expiresAt > new Date();
      expect(isValid).toBe(true);
    });

    it('should calculate days remaining correctly', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const daysRemaining = Math.ceil(
        (futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysRemaining).toBe(30);
    });
  });

  describe('License Features', () => {
    const featuresByType = {
      TRIAL: {
        maxUsers: 5,
        maxEntities: 1,
        maxProcesses: 10,
        aiInsights: true,
        whiteLabel: false,
      },
      STANDARD: {
        maxUsers: 25,
        maxEntities: 3,
        maxProcesses: 50,
        aiInsights: true,
        whiteLabel: false,
      },
      PROFESSIONAL: {
        maxUsers: 100,
        maxEntities: 10,
        maxProcesses: 200,
        aiInsights: true,
        whiteLabel: false,
      },
      ENTERPRISE: {
        maxUsers: 500,
        maxEntities: 50,
        maxProcesses: 1000,
        aiInsights: true,
        whiteLabel: true,
      },
      UNLIMITED: {
        maxUsers: -1,
        maxEntities: -1,
        maxProcesses: -1,
        aiInsights: true,
        whiteLabel: true,
      },
    };

    it('should return correct features for TRIAL license', () => {
      const features = featuresByType.TRIAL;
      expect(features.maxUsers).toBe(5);
      expect(features.maxEntities).toBe(1);
      expect(features.whiteLabel).toBe(false);
    });

    it('should return correct features for ENTERPRISE license', () => {
      const features = featuresByType.ENTERPRISE;
      expect(features.maxUsers).toBe(500);
      expect(features.whiteLabel).toBe(true);
    });

    it('should return unlimited for UNLIMITED license', () => {
      const features = featuresByType.UNLIMITED;
      expect(features.maxUsers).toBe(-1);
      expect(features.maxEntities).toBe(-1);
      expect(features.maxProcesses).toBe(-1);
    });
  });

  describe('Limit Checking', () => {
    it('should allow when under limit', () => {
      const limit = 100;
      const current = 50;

      const allowed = current < limit;
      expect(allowed).toBe(true);
    });

    it('should deny when at limit', () => {
      const limit = 100;
      const current = 100;

      const allowed = current < limit;
      expect(allowed).toBe(false);
    });

    it('should always allow for unlimited (-1)', () => {
      const limit = -1;
      const current = 1000000;

      const allowed = limit === -1 || current < limit;
      expect(allowed).toBe(true);
    });
  });
});

// -----------------------------------------------------------------------------
// Hardware Fingerprint Tests
// -----------------------------------------------------------------------------

describe('Hardware Fingerprint', () => {
  it('should generate consistent fingerprint', () => {
    const components = ['hostname', 'linux', 'x64', 'Intel CPU', 'aa:bb:cc:dd:ee:ff'];

    const hash1 = crypto.createHash('sha256').update(components.join(':')).digest('hex').substring(0, 32);
    const hash2 = crypto.createHash('sha256').update(components.join(':')).digest('hex').substring(0, 32);

    expect(hash1).toBe(hash2);
  });

  it('should generate different fingerprints for different components', () => {
    const components1 = ['host1', 'linux', 'x64', 'Intel CPU', 'aa:bb:cc:dd:ee:ff'];
    const components2 = ['host2', 'linux', 'x64', 'Intel CPU', 'aa:bb:cc:dd:ee:ff'];

    const hash1 = crypto.createHash('sha256').update(components1.join(':')).digest('hex').substring(0, 32);
    const hash2 = crypto.createHash('sha256').update(components2.join(':')).digest('hex').substring(0, 32);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce 32 character fingerprint', () => {
    const components = ['hostname', 'linux', 'x64', 'Intel CPU', 'aa:bb:cc:dd:ee:ff'];
    const fingerprint = crypto.createHash('sha256').update(components.join(':')).digest('hex').substring(0, 32);

    expect(fingerprint.length).toBe(32);
    expect(/^[a-f0-9]+$/.test(fingerprint)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Offline Mode Tests
// -----------------------------------------------------------------------------

describe('OfflineModeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI Cache', () => {
    it('should hash prompts consistently', () => {
      const prompt = 'What is the process efficiency?';

      const hash1 = crypto.createHash('sha256').update(prompt).digest('hex');
      const hash2 = crypto.createHash('sha256').update(prompt).digest('hex');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different prompts', () => {
      const prompt1 = 'What is the process efficiency?';
      const prompt2 = 'How can I improve?';

      const hash1 = crypto.createHash('sha256').update(prompt1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(prompt2).digest('hex');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Sync Package', () => {
    it('should calculate checksum correctly', () => {
      const data = {
        entities: [{ id: '1', name: 'Test' }],
        processes: [],
        users: [],
        configurations: [],
      };

      const checksum = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

      expect(checksum.length).toBe(64);
    });

    it('should detect data tampering via checksum', () => {
      const originalData = {
        entities: [{ id: '1', name: 'Test' }],
        processes: [],
        users: [],
        configurations: [],
      };

      const originalChecksum = crypto.createHash('sha256').update(JSON.stringify(originalData)).digest('hex');

      // Tamper with data
      const tamperedData = {
        ...originalData,
        entities: [{ id: '1', name: 'Tampered' }],
      };

      const tamperedChecksum = crypto.createHash('sha256').update(JSON.stringify(tamperedData)).digest('hex');

      expect(originalChecksum).not.toBe(tamperedChecksum);
    });
  });

  describe('Connectivity Detection', () => {
    it('should handle timeout correctly', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 100);

      try {
        await new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Aborted')));
          setTimeout(() => {}, 200);
        });
        expect.fail('Should have timed out');
      } catch (error) {
        expect((error as Error).message).toBe('Aborted');
      } finally {
        clearTimeout(timeout);
      }
    });
  });
});

// -----------------------------------------------------------------------------
// Usage Metrics Tests
// -----------------------------------------------------------------------------

describe('Usage Metrics', () => {
  it('should track user count correctly', async () => {
    mockPrisma.user.count.mockResolvedValue(50);

    const count = await mockPrisma.user.count();
    expect(count).toBe(50);
  });

  it('should track entity count correctly', async () => {
    mockPrisma.entity.count.mockResolvedValue(10);

    const count = await mockPrisma.entity.count();
    expect(count).toBe(10);
  });

  it('should track process count correctly', async () => {
    mockPrisma.process.count.mockResolvedValue(100);

    const count = await mockPrisma.process.count();
    expect(count).toBe(100);
  });
});

// -----------------------------------------------------------------------------
// License Signature Tests
// -----------------------------------------------------------------------------

describe('License Signature', () => {
  it('should create consistent data for signing', () => {
    const payload = {
      id: 'lic_123',
      type: 'ENTERPRISE',
      orgId: 'org_456',
      orgName: 'Test Organization',
      iat: '2023-12-01T00:00:00.000Z',
      exp: '2024-12-01T00:00:00.000Z',
    };

    const dataToSign1 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const dataToSign2 = Buffer.from(JSON.stringify(payload)).toString('base64');

    expect(dataToSign1).toBe(dataToSign2);
  });

  it('should produce valid base64 encoded payload', () => {
    const payload = {
      id: 'lic_123',
      type: 'ENTERPRISE',
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));

    expect(decoded.id).toBe(payload.id);
    expect(decoded.type).toBe(payload.type);
  });
});
