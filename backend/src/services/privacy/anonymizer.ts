/**
 * Content Anonymization Service
 * Anonymizes personally identifiable information (PII) in content
 * T295 - Content anonymization service
 */

import { createHash } from 'crypto';

export type AnonymizationStrategy = 'hash' | 'mask' | 'remove' | 'generalize' | 'pseudonymize';

export interface AnonymizationConfig {
  enabled: boolean;
  strategies: Record<string, AnonymizationStrategy>;
  preserveFormat: boolean;
  salt?: string;
  pseudonymMapping: boolean;
}

export interface AnonymizationResult {
  original: string;
  anonymized: string;
  strategy: AnonymizationStrategy;
  fieldType: string;
}

export interface AnonymizedRecord {
  data: Record<string, unknown>;
  anonymizedFields: string[];
  mappingId?: string;
}

export interface PiiDetectionResult {
  field: string;
  value: string;
  type: PiiType;
  confidence: number;
  position?: { start: number; end: number };
}

export type PiiType =
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'date_of_birth'
  | 'bank_account'
  | 'custom';

// PII detection patterns
const PII_PATTERNS: Record<PiiType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  name: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
  address: /\d+\s+[\w\s]+(?:street|str|straße|strasse|avenue|ave|road|rd|way|lane|platz|gasse)\b/gi,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  date_of_birth: /\b(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[012])[./-](?:19|20)\d{2}\b/g,
  bank_account: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, // IBAN
  custom: /./g, // Placeholder
};

// German-specific patterns
const GERMAN_PII_PATTERNS: Record<string, RegExp> = {
  steuer_id: /\b\d{11}\b/g, // German tax ID
  sozialversicherungsnummer: /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{3}\b/g,
  personalausweis: /\b[A-Z0-9]{9}\b/g,
};

const DEFAULT_CONFIG: AnonymizationConfig = {
  enabled: true,
  strategies: {
    email: 'pseudonymize',
    phone: 'mask',
    name: 'pseudonymize',
    address: 'generalize',
    ssn: 'remove',
    credit_card: 'remove',
    ip_address: 'hash',
    date_of_birth: 'generalize',
    bank_account: 'mask',
  },
  preserveFormat: true,
  pseudonymMapping: true,
};

// Pseudonym storage (in production, use database)
const pseudonymMap = new Map<string, string>();
const reversePseudonymMap = new Map<string, string>();

/**
 * Detect PII in text content
 */
export function detectPii(
  text: string,
  options?: { includeGerman?: boolean }
): PiiDetectionResult[] {
  const results: PiiDetectionResult[] = [];

  // Check standard patterns
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (type === 'custom') continue;

    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        field: 'content',
        value: match[0],
        type: type as PiiType,
        confidence: calculateConfidence(match[0], type as PiiType),
        position: { start: match.index, end: match.index + match[0].length },
      });
    }
  }

  // Check German-specific patterns
  if (options?.includeGerman) {
    for (const [name, pattern] of Object.entries(GERMAN_PII_PATTERNS)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        results.push({
          field: 'content',
          value: match[0],
          type: 'custom',
          confidence: 0.8,
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    }
  }

  return results;
}

/**
 * Detect PII in a record
 */
export function detectPiiInRecord(
  record: Record<string, unknown>,
  options?: { includeGerman?: boolean }
): PiiDetectionResult[] {
  const results: PiiDetectionResult[] = [];

  for (const [field, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      const detections = detectPii(value, options);
      for (const detection of detections) {
        results.push({
          ...detection,
          field,
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      const nestedResults = detectPiiInRecord(
        value as Record<string, unknown>,
        options
      );
      for (const detection of nestedResults) {
        results.push({
          ...detection,
          field: `${field}.${detection.field}`,
        });
      }
    }
  }

  return results;
}

/**
 * Anonymize a single value
 */
export function anonymizeValue(
  value: string,
  type: PiiType,
  config: AnonymizationConfig = DEFAULT_CONFIG
): AnonymizationResult {
  const strategy = config.strategies[type] || 'mask';

  let anonymized: string;

  switch (strategy) {
    case 'hash':
      anonymized = hashValue(value, config.salt);
      break;

    case 'mask':
      anonymized = maskValue(value, type, config.preserveFormat);
      break;

    case 'remove':
      anonymized = '[REMOVED]';
      break;

    case 'generalize':
      anonymized = generalizeValue(value, type);
      break;

    case 'pseudonymize':
      anonymized = pseudonymizeValue(value, type, config);
      break;

    default:
      anonymized = maskValue(value, type, config.preserveFormat);
  }

  return {
    original: value,
    anonymized,
    strategy,
    fieldType: type,
  };
}

/**
 * Anonymize text content
 */
export function anonymizeText(
  text: string,
  config: AnonymizationConfig = DEFAULT_CONFIG,
  options?: { includeGerman?: boolean }
): { text: string; anonymizedCount: number } {
  if (!config.enabled) {
    return { text, anonymizedCount: 0 };
  }

  const detections = detectPii(text, options);
  let result = text;
  let anonymizedCount = 0;

  // Sort by position descending to preserve indices
  const sortedDetections = detections.sort(
    (a, b) => (b.position?.start || 0) - (a.position?.start || 0)
  );

  for (const detection of sortedDetections) {
    const anonymized = anonymizeValue(detection.value, detection.type, config);
    if (detection.position) {
      result =
        result.slice(0, detection.position.start) +
        anonymized.anonymized +
        result.slice(detection.position.end);
      anonymizedCount++;
    }
  }

  return { text: result, anonymizedCount };
}

/**
 * Anonymize a record
 */
export function anonymizeRecord(
  record: Record<string, unknown>,
  config: AnonymizationConfig = DEFAULT_CONFIG,
  options?: { includeGerman?: boolean }
): AnonymizedRecord {
  if (!config.enabled) {
    return {
      data: record,
      anonymizedFields: [],
    };
  }

  const anonymizedFields: string[] = [];
  const data = { ...record };

  // Known PII field names
  const piiFieldNames: Record<string, PiiType> = {
    email: 'email',
    mail: 'email',
    e_mail: 'email',
    phone: 'phone',
    telephone: 'phone',
    mobile: 'phone',
    fax: 'phone',
    name: 'name',
    firstName: 'name',
    lastName: 'name',
    fullName: 'name',
    vorname: 'name',
    nachname: 'name',
    address: 'address',
    street: 'address',
    strasse: 'address',
    anschrift: 'address',
    ssn: 'ssn',
    socialSecurity: 'ssn',
    creditCard: 'credit_card',
    cardNumber: 'credit_card',
    ipAddress: 'ip_address',
    ip: 'ip_address',
    birthDate: 'date_of_birth',
    dateOfBirth: 'date_of_birth',
    geburtsdatum: 'date_of_birth',
    bankAccount: 'bank_account',
    iban: 'bank_account',
    kontonummer: 'bank_account',
  };

  const processField = (
    obj: Record<string, unknown>,
    path: string = ''
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();

      if (typeof value === 'string') {
        // Check if field name suggests PII
        const piiType = piiFieldNames[lowerKey];

        if (piiType) {
          const anonymized = anonymizeValue(value, piiType, config);
          result[key] = anonymized.anonymized;
          anonymizedFields.push(fieldPath);
        } else {
          // Check content for PII
          const detections = detectPii(value, options);
          if (detections.length > 0) {
            const { text } = anonymizeText(value, config, options);
            result[key] = text;
            anonymizedFields.push(fieldPath);
          } else {
            result[key] = value;
          }
        }
      } else if (Array.isArray(value)) {
        result[key] = value.map((item, idx) => {
          if (typeof item === 'string') {
            const { text, anonymizedCount } = anonymizeText(item, config, options);
            if (anonymizedCount > 0) {
              anonymizedFields.push(`${fieldPath}[${idx}]`);
            }
            return text;
          } else if (typeof item === 'object' && item !== null) {
            return processField(item as Record<string, unknown>, `${fieldPath}[${idx}]`);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = processField(value as Record<string, unknown>, fieldPath);
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  const anonymizedData = processField(data);

  // Generate mapping ID if pseudonymization is used
  let mappingId: string | undefined;
  if (config.pseudonymMapping && anonymizedFields.length > 0) {
    mappingId = createHash('sha256')
      .update(JSON.stringify(record) + Date.now())
      .digest('hex')
      .slice(0, 16);
  }

  return {
    data: anonymizedData,
    anonymizedFields,
    mappingId,
  };
}

/**
 * Bulk anonymize records
 */
export function anonymizeRecords(
  records: Array<Record<string, unknown>>,
  config: AnonymizationConfig = DEFAULT_CONFIG,
  options?: { includeGerman?: boolean }
): AnonymizedRecord[] {
  return records.map((record) => anonymizeRecord(record, config, options));
}

/**
 * Get pseudonym mapping (for authorized reversal)
 */
export function getPseudonymMapping(pseudonym: string): string | undefined {
  return reversePseudonymMap.get(pseudonym);
}

/**
 * Clear all pseudonym mappings
 */
export function clearPseudonymMappings(): void {
  pseudonymMap.clear();
  reversePseudonymMap.clear();
}

// Helper functions

function calculateConfidence(value: string, type: PiiType): number {
  switch (type) {
    case 'email':
      return value.includes('@') && value.includes('.') ? 0.95 : 0.5;
    case 'phone':
      const digits = value.replace(/\D/g, '');
      return digits.length >= 10 ? 0.85 : 0.6;
    case 'name':
      return value.split(' ').length >= 2 ? 0.7 : 0.4;
    case 'credit_card':
      return luhnCheck(value.replace(/\D/g, '')) ? 0.95 : 0.3;
    case 'ip_address':
      const parts = value.split('.');
      return parts.every((p) => parseInt(p) <= 255) ? 0.9 : 0.5;
    default:
      return 0.7;
  }
}

function hashValue(value: string, salt?: string): string {
  const toHash = salt ? `${value}${salt}` : value;
  return createHash('sha256').update(toHash).digest('hex').slice(0, 16);
}

function maskValue(value: string, type: PiiType, preserveFormat: boolean): string {
  if (!preserveFormat) {
    return '*'.repeat(Math.min(value.length, 20));
  }

  switch (type) {
    case 'email':
      const [local, domain] = value.split('@');
      if (!domain) return '***@***.***';
      return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain[0]}${'*'.repeat(Math.max(domain.length - 4, 2))}${domain.slice(-3)}`;

    case 'phone':
      return value.replace(/\d(?=\d{4})/g, '*');

    case 'credit_card':
      return value.replace(/\d(?=\d{4})/g, '*');

    case 'bank_account':
      const masked = value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
      return masked;

    default:
      const visibleChars = Math.max(1, Math.floor(value.length * 0.2));
      return value.slice(0, visibleChars) + '*'.repeat(value.length - visibleChars);
  }
}

function generalizeValue(value: string, type: PiiType): string {
  switch (type) {
    case 'address':
      // Keep only city/region
      const parts = value.split(',');
      if (parts.length > 1) {
        return `[LOCATION: ${parts[parts.length - 1].trim()}]`;
      }
      return '[LOCATION]';

    case 'date_of_birth':
      // Keep only year
      const yearMatch = value.match(/(19|20)\d{2}/);
      if (yearMatch) {
        return `[YEAR: ${yearMatch[0]}]`;
      }
      return '[DATE]';

    case 'name':
      // Keep initials
      const initials = value
        .split(' ')
        .map((word) => word[0])
        .join('.');
      return `[NAME: ${initials}.]`;

    default:
      return `[${type.toUpperCase()}]`;
  }
}

function pseudonymizeValue(
  value: string,
  type: PiiType,
  config: AnonymizationConfig
): string {
  // Check existing mapping
  const existing = pseudonymMap.get(value);
  if (existing) {
    return existing;
  }

  // Generate pseudonym
  const hash = hashValue(value, config.salt);
  let pseudonym: string;

  switch (type) {
    case 'email':
      pseudonym = `user_${hash.slice(0, 8)}@example.com`;
      break;
    case 'phone':
      pseudonym = `+1-555-${hash.slice(0, 3)}-${hash.slice(3, 7)}`;
      break;
    case 'name':
      pseudonym = `Person_${hash.slice(0, 6)}`;
      break;
    default:
      pseudonym = `${type}_${hash.slice(0, 10)}`;
  }

  // Store mapping if enabled
  if (config.pseudonymMapping) {
    pseudonymMap.set(value, pseudonym);
    reversePseudonymMap.set(pseudonym, value);
  }

  return pseudonym;
}

function luhnCheck(num: string): boolean {
  const arr = num.split('').reverse().map((x) => parseInt(x));
  const sum = arr.reduce((acc, val, i) => {
    if (i % 2 !== 0) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    return acc + val;
  }, 0);
  return sum % 10 === 0;
}

export default {
  detectPii,
  detectPiiInRecord,
  anonymizeValue,
  anonymizeText,
  anonymizeRecord,
  anonymizeRecords,
  getPseudonymMapping,
  clearPseudonymMappings,
};
