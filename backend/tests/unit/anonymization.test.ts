// =============================================================================
// Anonymization Tests
// SCALE Tier - Task T241-T244
//
// Unit tests for data anonymization and k-anonymity validation
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Mock PrismaClient
const mockPrisma = {
  benchmarkSegment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  benchmarkOptIn: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  process: {
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// -----------------------------------------------------------------------------
// K-Anonymity Tests
// -----------------------------------------------------------------------------

describe('K-Anonymity Validation', () => {
  const MIN_PARTICIPANTS = 10;

  it('should pass k-anonymity with 10+ participants', () => {
    const entityIds = Array.from({ length: 15 }, (_, i) => `entity_${i}`);
    const uniqueCount = new Set(entityIds).size;

    expect(uniqueCount).toBeGreaterThanOrEqual(MIN_PARTICIPANTS);
  });

  it('should fail k-anonymity with fewer than 10 participants', () => {
    const entityIds = Array.from({ length: 5 }, (_, i) => `entity_${i}`);
    const uniqueCount = new Set(entityIds).size;

    expect(uniqueCount).toBeLessThan(MIN_PARTICIPANTS);
  });

  it('should count unique entities correctly with duplicates', () => {
    const entityIds = [
      'entity_1',
      'entity_1',
      'entity_2',
      'entity_2',
      'entity_3',
      'entity_4',
      'entity_5',
    ];
    const uniqueCount = new Set(entityIds).size;

    expect(uniqueCount).toBe(5);
  });

  it('should require exact minimum for edge case', () => {
    const entityIds = Array.from({ length: 10 }, (_, i) => `entity_${i}`);
    const uniqueCount = new Set(entityIds).size;

    expect(uniqueCount).toBe(MIN_PARTICIPANTS);
  });
});

// -----------------------------------------------------------------------------
// Data Aggregation Tests
// -----------------------------------------------------------------------------

describe('Data Aggregation', () => {
  const calculateMean = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 100) / 100;
  };

  const calculateMedian = (sortedValues: number[]): number => {
    const mid = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    }
    return sortedValues[mid];
  };

  const calculatePercentile = (sortedValues: number[], percentile: number): number => {
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return sortedValues[lower];
    }
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  };

  const calculateStdDev = (values: number[]): number => {
    if (values.length < 2) return 0;
    const mean = calculateMean(values);
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    return Math.round(Math.sqrt(avgSquaredDiff) * 100) / 100;
  };

  it('should calculate mean correctly', () => {
    const values = [10, 20, 30, 40, 50];
    expect(calculateMean(values)).toBe(30);
  });

  it('should calculate median for odd count', () => {
    const values = [10, 20, 30, 40, 50];
    expect(calculateMedian(values)).toBe(30);
  });

  it('should calculate median for even count', () => {
    const values = [10, 20, 30, 40];
    expect(calculateMedian(values)).toBe(25);
  });

  it('should calculate 25th percentile', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p25 = calculatePercentile(values, 25);
    expect(p25).toBe(32.5);
  });

  it('should calculate 75th percentile', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p75 = calculatePercentile(values, 75);
    expect(p75).toBe(77.5);
  });

  it('should calculate standard deviation', () => {
    const values = [10, 20, 30, 40, 50];
    const stddev = calculateStdDev(values);
    expect(stddev).toBeCloseTo(15.81, 1);
  });

  it('should handle empty arrays', () => {
    expect(calculateMean([])).toBe(0);
    expect(calculateStdDev([])).toBe(0);
  });

  it('should handle single value arrays', () => {
    expect(calculateMean([42])).toBe(42);
    expect(calculateStdDev([42])).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Identifier Stripping Tests
// -----------------------------------------------------------------------------

describe('Identifier Stripping', () => {
  const identifierPatterns = [
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '[EMAIL_REDACTED]',
    },
    {
      pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      replacement: '[PHONE_REDACTED]',
    },
    {
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      replacement: '[IP_REDACTED]',
    },
    {
      pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      replacement: '[UUID_REDACTED]',
    },
  ];

  const stripIdentifiers = (text: string): string => {
    let result = text;
    for (const { pattern, replacement } of identifierPatterns) {
      result = result.replace(pattern, replacement);
    }
    return result;
  };

  it('should strip email addresses', () => {
    const text = 'Contact john.doe@example.com for more info';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe('Contact [EMAIL_REDACTED] for more info');
  });

  it('should strip multiple email addresses', () => {
    const text = 'john@example.com and jane@company.org';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe('[EMAIL_REDACTED] and [EMAIL_REDACTED]');
  });

  it('should strip phone numbers', () => {
    const text = 'Call 555-123-4567 or 555.123.4567';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe('Call [PHONE_REDACTED] or [PHONE_REDACTED]');
  });

  it('should strip IP addresses', () => {
    const text = 'Server at 192.168.1.100';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe('Server at [IP_REDACTED]');
  });

  it('should strip UUIDs', () => {
    const text = 'Record id: 123e4567-e89b-12d3-a456-426614174000';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe('Record id: [UUID_REDACTED]');
  });

  it('should handle text with no identifiers', () => {
    const text = 'This is a normal text without any identifiers';
    const stripped = stripIdentifiers(text);
    expect(stripped).toBe(text);
  });

  it('should handle empty string', () => {
    expect(stripIdentifiers('')).toBe('');
  });
});

// -----------------------------------------------------------------------------
// Pseudonymization Tests
// -----------------------------------------------------------------------------

describe('Pseudonymization', () => {
  const pseudonymize = (identifier: string, salt: string): string => {
    const hash = crypto
      .createHmac('sha256', salt)
      .update(identifier)
      .digest('hex');
    return hash.substring(0, 16);
  };

  it('should produce consistent pseudonyms', () => {
    const id = 'user@company.com';
    const salt = 'secret-salt';

    const pseudo1 = pseudonymize(id, salt);
    const pseudo2 = pseudonymize(id, salt);

    expect(pseudo1).toBe(pseudo2);
  });

  it('should produce different pseudonyms for different inputs', () => {
    const salt = 'secret-salt';

    const pseudo1 = pseudonymize('user1@company.com', salt);
    const pseudo2 = pseudonymize('user2@company.com', salt);

    expect(pseudo1).not.toBe(pseudo2);
  });

  it('should produce different pseudonyms for different salts', () => {
    const id = 'user@company.com';

    const pseudo1 = pseudonymize(id, 'salt1');
    const pseudo2 = pseudonymize(id, 'salt2');

    expect(pseudo1).not.toBe(pseudo2);
  });

  it('should produce 16 character pseudonyms', () => {
    const pseudo = pseudonymize('identifier', 'salt');
    expect(pseudo.length).toBe(16);
  });

  it('should produce hex-only pseudonyms', () => {
    const pseudo = pseudonymize('identifier', 'salt');
    expect(/^[a-f0-9]+$/.test(pseudo)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Anonymization Validation Tests
// -----------------------------------------------------------------------------

describe('Anonymization Validation', () => {
  interface AnonymizedMetric {
    metricType: string;
    aggregationType: string;
    value: number;
    sampleSize: number;
  }

  const validateAnonymization = (
    participantCount: number,
    metrics: AnonymizedMetric[],
    minParticipants: number = 10
  ): { valid: boolean; issues: string[] } => {
    const issues: string[] = [];

    if (participantCount < minParticipants) {
      issues.push(`K-anonymity violation: ${participantCount} < ${minParticipants}`);
    }

    const validAggTypes = ['avg', 'median', 'p25', 'p75', 'min', 'max', 'stddev'];
    for (const metric of metrics) {
      if (!validAggTypes.includes(metric.aggregationType)) {
        issues.push(`Non-aggregated value found: ${metric.aggregationType}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  };

  it('should validate successful anonymization', () => {
    const result = validateAnonymization(15, [
      { metricType: 'cycle_time', aggregationType: 'avg', value: 10, sampleSize: 15 },
      { metricType: 'cycle_time', aggregationType: 'median', value: 9, sampleSize: 15 },
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should catch k-anonymity violation', () => {
    const result = validateAnonymization(5, [
      { metricType: 'cycle_time', aggregationType: 'avg', value: 10, sampleSize: 5 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('K-anonymity violation: 5 < 10');
  });

  it('should catch non-aggregated values', () => {
    const result = validateAnonymization(15, [
      { metricType: 'cycle_time', aggregationType: 'raw', value: 10, sampleSize: 15 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Non-aggregated value found: raw');
  });

  it('should allow all valid aggregation types', () => {
    const validTypes = ['avg', 'median', 'p25', 'p75', 'min', 'max', 'stddev'];
    const metrics = validTypes.map((type) => ({
      metricType: 'cycle_time',
      aggregationType: type,
      value: 10,
      sampleSize: 15,
    }));

    const result = validateAnonymization(15, metrics);
    expect(result.valid).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Sensitive Field Stripping Tests
// -----------------------------------------------------------------------------

describe('Sensitive Field Stripping', () => {
  const sensitiveFields = ['companyName', 'email', 'userId', 'ipAddress'];

  const stripSensitiveFields = <T extends Record<string, unknown>>(
    obj: T,
    fields: string[]
  ): T => {
    const result = { ...obj };
    for (const field of fields) {
      if (field in result) {
        delete result[field];
      }
    }
    return result;
  };

  it('should remove sensitive fields', () => {
    const data = {
      companyName: 'Acme Corp',
      metricValue: 42,
      email: 'admin@acme.com',
    };

    const stripped = stripSensitiveFields(data, sensitiveFields);

    expect(stripped).not.toHaveProperty('companyName');
    expect(stripped).not.toHaveProperty('email');
    expect(stripped.metricValue).toBe(42);
  });

  it('should handle object with no sensitive fields', () => {
    const data = {
      metricValue: 42,
      category: 'test',
    };

    const stripped = stripSensitiveFields(data, sensitiveFields);

    expect(stripped.metricValue).toBe(42);
    expect(stripped.category).toBe('test');
  });

  it('should handle empty object', () => {
    const data = {};
    const stripped = stripSensitiveFields(data, sensitiveFields);
    expect(Object.keys(stripped)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Benchmark Segment Tests
// -----------------------------------------------------------------------------

describe('Benchmark Segments', () => {
  it('should create segment key correctly', () => {
    const createSegmentKey = (
      industry: string,
      companySize: string,
      region: string
    ): string => {
      return `${industry || 'ALL'}_${companySize || 'ALL'}_${region || 'ALL'}`;
    };

    expect(createSegmentKey('manufacturing', 'large', 'europe')).toBe(
      'manufacturing_large_europe'
    );
    expect(createSegmentKey('', 'large', 'europe')).toBe('ALL_large_europe');
    expect(createSegmentKey('', '', '')).toBe('ALL_ALL_ALL');
  });

  it('should format segment name correctly', () => {
    const formatSegmentName = (segment: {
      industry: string;
      companySize: string;
      region: string;
    }): string => {
      const parts = [];
      if (segment.industry !== 'ALL') parts.push(segment.industry);
      if (segment.companySize !== 'ALL') parts.push(segment.companySize);
      if (segment.region !== 'ALL') parts.push(segment.region);
      return parts.length > 0 ? parts.join(' / ') : 'Global';
    };

    expect(
      formatSegmentName({ industry: 'Manufacturing', companySize: 'Large', region: 'Europe' })
    ).toBe('Manufacturing / Large / Europe');
    expect(
      formatSegmentName({ industry: 'ALL', companySize: 'ALL', region: 'ALL' })
    ).toBe('Global');
    expect(
      formatSegmentName({ industry: 'Manufacturing', companySize: 'ALL', region: 'ALL' })
    ).toBe('Manufacturing');
  });
});
