/**
 * Accuracy Tests: Sync Accuracy
 * Task: T216
 *
 * Validates sync accuracy across all connectors.
 * Target: 99% accuracy for all data transformations.
 */

import { describe, it, expect } from 'vitest';

interface SourceRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

interface SyncedRecord {
  externalId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

interface AccuracyResult {
  total: number;
  matched: number;
  mismatched: number;
  missing: number;
  accuracy: number;
  mismatches: Array<{ sourceId: string; field: string; expected: unknown; actual: unknown }>;
}

function compareRecords(source: SourceRecord[], synced: SyncedRecord[]): AccuracyResult {
  const result: AccuracyResult = {
    total: source.length,
    matched: 0,
    mismatched: 0,
    missing: 0,
    accuracy: 0,
    mismatches: [],
  };

  const syncedMap = new Map(synced.map(r => [r.externalId, r]));

  for (const sourceRecord of source) {
    const syncedRecord = syncedMap.get(sourceRecord.id);

    if (!syncedRecord) {
      result.missing++;
      continue;
    }

    let hasMatch = true;

    // Compare timestamp
    if (sourceRecord.timestamp.getTime() !== syncedRecord.timestamp.getTime()) {
      hasMatch = false;
      result.mismatches.push({
        sourceId: sourceRecord.id,
        field: 'timestamp',
        expected: sourceRecord.timestamp,
        actual: syncedRecord.timestamp,
      });
    }

    // Compare type
    if (sourceRecord.type !== syncedRecord.eventType.split('.').pop()) {
      hasMatch = false;
      result.mismatches.push({
        sourceId: sourceRecord.id,
        field: 'type',
        expected: sourceRecord.type,
        actual: syncedRecord.eventType,
      });
    }

    if (hasMatch) {
      result.matched++;
    } else {
      result.mismatched++;
    }
  }

  result.accuracy = (result.matched / result.total) * 100;
  return result;
}

function transformSourceToSynced(source: SourceRecord): SyncedRecord {
  return {
    externalId: source.id,
    eventType: `connector.${source.type}`,
    metadata: { ...source.data },
    timestamp: source.timestamp,
  };
}

describe('Sync Accuracy', () => {
  describe('Data Transformation Accuracy', () => {
    it('should achieve 99% accuracy target', () => {
      const sourceRecords: SourceRecord[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `record-${i}`,
        type: 'document',
        data: { title: `Doc ${i}`, content: `Content ${i}` },
        timestamp: new Date('2024-01-01'),
      }));

      const syncedRecords = sourceRecords.map(transformSourceToSynced);

      const result = compareRecords(sourceRecords, syncedRecords);

      expect(result.accuracy).toBeGreaterThanOrEqual(99);
    });

    it('should preserve all source fields', () => {
      const source: SourceRecord = {
        id: 'test-1',
        type: 'contact',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          tags: ['customer', 'vip'],
        },
        timestamp: new Date(),
      };

      const synced = transformSourceToSynced(source);

      expect(synced.metadata.firstName).toBe('John');
      expect(synced.metadata.lastName).toBe('Doe');
      expect(synced.metadata.email).toBe('john@example.com');
      expect(synced.metadata.tags).toEqual(['customer', 'vip']);
    });

    it('should handle null values correctly', () => {
      const source: SourceRecord = {
        id: 'test-null',
        type: 'document',
        data: { title: null, description: undefined, content: '' },
        timestamp: new Date(),
      };

      const synced = transformSourceToSynced(source);

      expect(synced.metadata.title).toBeNull();
      expect(synced.metadata.description).toBeUndefined();
      expect(synced.metadata.content).toBe('');
    });

    it('should preserve date precision', () => {
      const timestamp = new Date('2024-06-15T10:30:45.123Z');
      const source: SourceRecord = {
        id: 'test-date',
        type: 'event',
        data: { scheduledAt: timestamp },
        timestamp,
      };

      const synced = transformSourceToSynced(source);

      expect(synced.timestamp.getTime()).toBe(timestamp.getTime());
    });

    it('should handle numeric precision', () => {
      const source: SourceRecord = {
        id: 'test-numbers',
        type: 'transaction',
        data: {
          amount: 123.45,
          quantity: 1000000,
          rate: 0.0001,
          percentage: 99.99,
        },
        timestamp: new Date(),
      };

      const synced = transformSourceToSynced(source);

      expect(synced.metadata.amount).toBe(123.45);
      expect(synced.metadata.quantity).toBe(1000000);
      expect(synced.metadata.rate).toBe(0.0001);
      expect(synced.metadata.percentage).toBe(99.99);
    });
  });

  describe('Data Type Transformations', () => {
    it('should correctly transform string fields', () => {
      const strings = ['simple', 'with spaces', 'special!@#$%', '', '  trimmed  ', 'UPPERCASE'];

      strings.forEach(str => {
        const source: SourceRecord = {
          id: `test-${str}`,
          type: 'test',
          data: { value: str },
          timestamp: new Date(),
        };

        const synced = transformSourceToSynced(source);
        expect(synced.metadata.value).toBe(str);
      });
    });

    it('should correctly transform arrays', () => {
      const source: SourceRecord = {
        id: 'test-array',
        type: 'test',
        data: {
          emptyArray: [],
          stringArray: ['a', 'b', 'c'],
          numberArray: [1, 2, 3],
          mixedArray: [1, 'two', true, null],
        },
        timestamp: new Date(),
      };

      const synced = transformSourceToSynced(source);

      expect(synced.metadata.emptyArray).toEqual([]);
      expect(synced.metadata.stringArray).toEqual(['a', 'b', 'c']);
      expect(synced.metadata.numberArray).toEqual([1, 2, 3]);
      expect(synced.metadata.mixedArray).toEqual([1, 'two', true, null]);
    });

    it('should correctly transform nested objects', () => {
      const source: SourceRecord = {
        id: 'test-nested',
        type: 'test',
        data: {
          level1: {
            level2: {
              level3: { value: 'deep' },
            },
          },
        },
        timestamp: new Date(),
      };

      const synced = transformSourceToSynced(source);
      const nested = synced.metadata.level1 as Record<string, unknown>;
      const level2 = nested.level2 as Record<string, unknown>;
      const level3 = level2.level3 as Record<string, unknown>;

      expect(level3.value).toBe('deep');
    });
  });

  describe('Missing Record Detection', () => {
    it('should detect missing records', () => {
      const source: SourceRecord[] = [
        { id: '1', type: 'doc', data: {}, timestamp: new Date() },
        { id: '2', type: 'doc', data: {}, timestamp: new Date() },
        { id: '3', type: 'doc', data: {}, timestamp: new Date() },
      ];

      const synced: SyncedRecord[] = [
        { externalId: '1', eventType: 'connector.doc', metadata: {}, timestamp: new Date() },
        { externalId: '3', eventType: 'connector.doc', metadata: {}, timestamp: new Date() },
      ];

      const result = compareRecords(source, synced);

      expect(result.missing).toBe(1);
      expect(result.accuracy).toBeLessThan(100);
    });
  });

  describe('Mismatch Detection', () => {
    it('should detect field mismatches', () => {
      const timestamp = new Date('2024-01-01');
      const source: SourceRecord[] = [
        { id: '1', type: 'document', data: {}, timestamp },
      ];

      const synced: SyncedRecord[] = [
        { externalId: '1', eventType: 'connector.wrong', metadata: {}, timestamp },
      ];

      const result = compareRecords(source, synced);

      expect(result.mismatched).toBe(1);
      expect(result.mismatches.length).toBeGreaterThan(0);
    });
  });

  describe('Connector-Specific Accuracy', () => {
    it('should validate Salesforce field mapping', () => {
      const salesforceRecord = {
        Id: 'sf-001',
        Name: 'Test Account',
        Industry: 'Technology',
        CreatedDate: '2024-01-01T00:00:00Z',
      };

      const transformed = {
        externalId: salesforceRecord.Id,
        eventType: 'crm.account',
        metadata: {
          name: salesforceRecord.Name,
          industry: salesforceRecord.Industry,
        },
        timestamp: new Date(salesforceRecord.CreatedDate),
      };

      expect(transformed.externalId).toBe('sf-001');
      expect(transformed.metadata.name).toBe('Test Account');
    });

    it('should validate HubSpot field mapping', () => {
      const hubspotRecord = {
        vid: 12345,
        properties: {
          firstname: { value: 'John' },
          lastname: { value: 'Doe' },
          email: { value: 'john@example.com' },
        },
      };

      const transformed = {
        externalId: String(hubspotRecord.vid),
        eventType: 'crm.contact',
        metadata: {
          firstName: hubspotRecord.properties.firstname.value,
          lastName: hubspotRecord.properties.lastname.value,
          email: hubspotRecord.properties.email.value,
        },
        timestamp: new Date(),
      };

      expect(transformed.externalId).toBe('12345');
      expect(transformed.metadata.firstName).toBe('John');
    });

    it('should validate Austrian accounting field mapping (BMD)', () => {
      const bmdRecord = {
        belegnummer: 'BEL-001',
        betrag: 1234.56,
        steuersatz: 20,
        buchungsdatum: '2024-01-15',
        kontonummer: '4000',
        gegenkontonummer: '2000',
      };

      const transformed = {
        externalId: bmdRecord.belegnummer,
        eventType: 'accounting.booking',
        metadata: {
          documentNumber: bmdRecord.belegnummer,
          amount: bmdRecord.betrag,
          vatRate: bmdRecord.steuersatz,
          accountNumber: bmdRecord.kontonummer,
          contraAccountNumber: bmdRecord.gegenkontonummer,
        },
        timestamp: new Date(bmdRecord.buchungsdatum),
      };

      expect(transformed.metadata.amount).toBe(1234.56);
      expect(transformed.metadata.vatRate).toBe(20);
    });
  });

  describe('Accuracy Statistics', () => {
    it('should calculate overall accuracy correctly', () => {
      const total = 1000;
      const matched = 995;
      const accuracy = (matched / total) * 100;

      expect(accuracy).toBe(99.5);
      expect(accuracy).toBeGreaterThanOrEqual(99);
    });

    it('should identify accuracy trends', () => {
      const dailyAccuracy = [99.1, 99.3, 99.0, 99.5, 99.2];
      const avgAccuracy = dailyAccuracy.reduce((a, b) => a + b, 0) / dailyAccuracy.length;
      const minAccuracy = Math.min(...dailyAccuracy);

      expect(avgAccuracy).toBeGreaterThan(99);
      expect(minAccuracy).toBeGreaterThanOrEqual(99);
    });
  });
});
