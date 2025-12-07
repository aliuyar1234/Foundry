/**
 * Blocking Key Generators
 * Generate keys to partition records into blocks for efficient duplicate detection
 *
 * Blocking reduces comparison complexity from O(n²) to O(n*b) where b is average block size.
 * Records with the same blocking key are compared, records with different keys are not.
 */

export interface BlockingKeyConfig {
  fields: string[];
  method: BlockingMethod;
  options?: BlockingOptions;
}

export type BlockingMethod =
  | 'exact'
  | 'prefix'
  | 'suffix'
  | 'soundex'
  | 'cologne_phonetic'
  | 'ngram'
  | 'metaphone'
  | 'normalized'
  | 'composite';

export interface BlockingOptions {
  prefixLength?: number;
  suffixLength?: number;
  ngramSize?: number;
  normalize?: boolean;
  caseInsensitive?: boolean;
}

export interface BlockingKey {
  key: string;
  method: BlockingMethod;
  field: string;
}

/**
 * Generate blocking keys for a record
 */
export function generateBlockingKeys(
  record: Record<string, unknown>,
  configs: BlockingKeyConfig[]
): BlockingKey[] {
  const keys: BlockingKey[] = [];

  for (const config of configs) {
    for (const field of config.fields) {
      const value = getFieldValue(record, field);
      if (!value) continue;

      const generatedKeys = generateKeysForValue(
        String(value),
        config.method,
        config.options
      );

      for (const key of generatedKeys) {
        keys.push({
          key,
          method: config.method,
          field,
        });
      }
    }
  }

  return keys;
}

/**
 * Get field value from nested object using dot notation
 */
function getFieldValue(record: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let value: unknown = record;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Generate keys for a single value based on method
 */
function generateKeysForValue(
  value: string,
  method: BlockingMethod,
  options?: BlockingOptions
): string[] {
  const normalized = options?.normalize !== false ? normalizeValue(value) : value;
  const processed = options?.caseInsensitive !== false ? normalized.toLowerCase() : normalized;

  switch (method) {
    case 'exact':
      return [processed];

    case 'prefix':
      return [generatePrefixKey(processed, options?.prefixLength || 3)];

    case 'suffix':
      return [generateSuffixKey(processed, options?.suffixLength || 3)];

    case 'soundex':
      return [generateSoundex(processed)];

    case 'cologne_phonetic':
      return [generateColognePhonetic(processed)];

    case 'ngram':
      return generateNgramKeys(processed, options?.ngramSize || 3);

    case 'metaphone':
      return [generateMetaphone(processed)];

    case 'normalized':
      return [processed];

    case 'composite':
      // Combine multiple methods
      return [
        generatePrefixKey(processed, 3),
        generateSoundex(processed),
        generateColognePhonetic(processed),
      ].filter((k) => k.length > 0);

    default:
      return [processed];
  }
}

/**
 * Normalize a value for blocking
 */
function normalizeValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate prefix key
 */
function generatePrefixKey(value: string, length: number): string {
  const cleaned = value.replace(/\s/g, '');
  return cleaned.substring(0, length).padEnd(length, '_');
}

/**
 * Generate suffix key
 */
function generateSuffixKey(value: string, length: number): string {
  const cleaned = value.replace(/\s/g, '');
  return cleaned.substring(Math.max(0, cleaned.length - length)).padStart(length, '_');
}

/**
 * Generate Soundex code (American phonetic algorithm)
 */
function generateSoundex(value: string): string {
  if (!value) return '';

  const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '';

  const firstLetter = cleaned[0];
  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let result = firstLetter;
  let lastCode = codes[firstLetter] || '';

  for (let i = 1; i < cleaned.length && result.length < 4; i++) {
    const code = codes[cleaned[i]];
    if (code && code !== lastCode) {
      result += code;
      lastCode = code;
    } else if (!code) {
      lastCode = '';
    }
  }

  return result.padEnd(4, '0');
}

/**
 * Generate Cologne Phonetic code (German phonetic algorithm)
 * Better suited for German/DACH names than Soundex
 */
export function generateColognePhonetic(value: string): string {
  if (!value) return '';

  // Normalize and uppercase
  let str = value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

  if (!str) return '';

  // German character substitutions
  str = str
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/ß/g, 'SS');

  const codes: string[] = [];
  const len = str.length;

  for (let i = 0; i < len; i++) {
    const char = str[i];
    const prev = i > 0 ? str[i - 1] : '';
    const next = i < len - 1 ? str[i + 1] : '';

    let code = '';

    switch (char) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
      case 'J':
      case 'Y':
        code = '0';
        break;

      case 'H':
        code = '';
        break;

      case 'B':
        code = '1';
        break;

      case 'P':
        code = next === 'H' ? '3' : '1';
        break;

      case 'D':
      case 'T':
        code = ['C', 'S', 'Z'].includes(next) ? '8' : '2';
        break;

      case 'F':
      case 'V':
      case 'W':
        code = '3';
        break;

      case 'G':
      case 'K':
      case 'Q':
        code = '4';
        break;

      case 'C':
        if (i === 0) {
          code = ['A', 'H', 'K', 'L', 'O', 'Q', 'R', 'U', 'X'].includes(next) ? '4' : '8';
        } else {
          code = ['S', 'Z'].includes(prev) ? '8' :
                 ['A', 'H', 'K', 'O', 'Q', 'U', 'X'].includes(next) ? '4' : '8';
        }
        break;

      case 'X':
        code = ['C', 'K', 'Q'].includes(prev) ? '8' : '48';
        break;

      case 'L':
        code = '5';
        break;

      case 'M':
      case 'N':
        code = '6';
        break;

      case 'R':
        code = '7';
        break;

      case 'S':
      case 'Z':
        code = '8';
        break;
    }

    codes.push(code);
  }

  // Remove consecutive duplicates and leading zeros (except if it's the only digit)
  let result = '';
  let lastCode = '';

  for (const code of codes) {
    for (const digit of code) {
      if (digit !== lastCode) {
        result += digit;
        lastCode = digit;
      }
    }
  }

  // Remove all zeros except leading position handling
  result = result.replace(/0/g, '');

  return result || '0';
}

/**
 * Generate n-gram keys
 */
function generateNgramKeys(value: string, n: number): string[] {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.length < n) return [cleaned];

  const ngrams: string[] = [];
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.push(cleaned.substring(i, i + n));
  }

  return [...new Set(ngrams)];
}

/**
 * Generate Double Metaphone code (improved phonetic algorithm)
 * Simplified implementation for blocking purposes
 */
function generateMetaphone(value: string): string {
  if (!value) return '';

  let str = value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

  if (!str) return '';

  // Common substitutions
  str = str
    .replace(/^KN|^GN|^PN|^AE|^WR/, (m) => m[1])
    .replace(/MB$/, 'M')
    .replace(/X/, 'KS')
    .replace(/PH/, 'F')
    .replace(/GH/, 'F')
    .replace(/CK/, 'K')
    .replace(/SCH/, 'SK')
    .replace(/SH/, 'X')
    .replace(/TH/, '0')
    .replace(/TCH/, 'X')
    .replace(/WH/, 'W');

  const vowels = 'AEIOU';
  let result = '';
  let i = 0;

  while (i < str.length && result.length < 6) {
    const char = str[i];

    if (vowels.includes(char)) {
      if (i === 0) result += 'A';
    } else if (char === 'B') {
      result += 'P';
    } else if (char === 'C') {
      result += 'K';
    } else if (char === 'D') {
      result += 'T';
    } else if (char === 'F') {
      result += 'F';
    } else if (char === 'G') {
      result += 'K';
    } else if (char === 'J') {
      result += 'J';
    } else if (char === 'K') {
      result += 'K';
    } else if (char === 'L') {
      result += 'L';
    } else if (char === 'M') {
      result += 'M';
    } else if (char === 'N') {
      result += 'N';
    } else if (char === 'P') {
      result += 'P';
    } else if (char === 'Q') {
      result += 'K';
    } else if (char === 'R') {
      result += 'R';
    } else if (char === 'S') {
      result += 'S';
    } else if (char === 'T') {
      result += 'T';
    } else if (char === 'V') {
      result += 'F';
    } else if (char === 'W') {
      result += 'W';
    } else if (char === 'X') {
      result += 'KS';
    } else if (char === 'Z') {
      result += 'S';
    }

    i++;
  }

  return result;
}

/**
 * Standard blocking configurations for different entity types
 */
export const STANDARD_BLOCKING_CONFIGS = {
  person: [
    { fields: ['lastName'], method: 'cologne_phonetic' as BlockingMethod },
    { fields: ['lastName'], method: 'prefix' as BlockingMethod, options: { prefixLength: 4 } },
    { fields: ['firstName', 'lastName'], method: 'soundex' as BlockingMethod },
    { fields: ['email'], method: 'prefix' as BlockingMethod, options: { prefixLength: 5 } },
  ],

  company: [
    { fields: ['name'], method: 'cologne_phonetic' as BlockingMethod },
    { fields: ['name'], method: 'prefix' as BlockingMethod, options: { prefixLength: 5 } },
    { fields: ['name'], method: 'ngram' as BlockingMethod, options: { ngramSize: 4 } },
    { fields: ['vatId'], method: 'exact' as BlockingMethod },
    { fields: ['registrationNumber'], method: 'exact' as BlockingMethod },
  ],

  address: [
    { fields: ['postalCode'], method: 'exact' as BlockingMethod },
    { fields: ['street'], method: 'cologne_phonetic' as BlockingMethod },
    { fields: ['city'], method: 'cologne_phonetic' as BlockingMethod },
    { fields: ['street'], method: 'prefix' as BlockingMethod, options: { prefixLength: 4 } },
  ],

  product: [
    { fields: ['sku'], method: 'exact' as BlockingMethod },
    { fields: ['ean'], method: 'exact' as BlockingMethod },
    { fields: ['name'], method: 'prefix' as BlockingMethod, options: { prefixLength: 6 } },
    { fields: ['name'], method: 'ngram' as BlockingMethod, options: { ngramSize: 3 } },
  ],
};

/**
 * Create record blocks from a set of records
 */
export function createBlocks<T extends Record<string, unknown>>(
  records: T[],
  configs: BlockingKeyConfig[]
): Map<string, T[]> {
  const blocks = new Map<string, T[]>();

  for (const record of records) {
    const keys = generateBlockingKeys(record, configs);

    for (const { key, method, field } of keys) {
      const blockKey = `${method}:${field}:${key}`;
      const existing = blocks.get(blockKey) || [];
      existing.push(record);
      blocks.set(blockKey, existing);
    }
  }

  return blocks;
}

/**
 * Get candidate pairs from blocks (records that share at least one blocking key)
 */
export function getCandidatePairs<T extends Record<string, unknown>>(
  records: T[],
  configs: BlockingKeyConfig[],
  idField: string = 'id'
): Array<[T, T]> {
  const blocks = createBlocks(records, configs);
  const pairsSeen = new Set<string>();
  const pairs: Array<[T, T]> = [];

  for (const block of blocks.values()) {
    if (block.length < 2) continue;

    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const id1 = String(block[i][idField]);
        const id2 = String(block[j][idField]);
        const pairKey = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;

        if (!pairsSeen.has(pairKey)) {
          pairsSeen.add(pairKey);
          pairs.push([block[i], block[j]]);
        }
      }
    }
  }

  return pairs;
}

export default {
  generateBlockingKeys,
  generateColognePhonetic,
  createBlocks,
  getCandidatePairs,
  STANDARD_BLOCKING_CONFIGS,
};
