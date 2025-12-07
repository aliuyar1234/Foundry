/**
 * Composite Matching Scorer
 * Combines multiple similarity algorithms with configurable weights
 * Optimized for entity matching in DACH region
 */

import {
  levenshteinSimilarity,
  damerauLevenshteinSimilarity,
} from './levenshtein.js';
import {
  jaroWinklerSimilarity,
  tokenJaroWinkler,
} from './jaroWinkler.js';
import {
  phoneticSimilarity,
  tokenPhoneticSimilarity,
  colognePhonetic,
} from './phonetic.js';

export interface FieldMatchConfig {
  field: string;
  weight: number;
  algorithm: MatchAlgorithm;
  options?: MatchOptions;
  required?: boolean;
  exactMatchBonus?: number;
}

export type MatchAlgorithm =
  | 'exact'
  | 'levenshtein'
  | 'damerau'
  | 'jaro_winkler'
  | 'token_jaro'
  | 'phonetic'
  | 'token_phonetic'
  | 'numeric'
  | 'date'
  | 'composite';

export interface MatchOptions {
  caseSensitive?: boolean;
  normalize?: boolean;
  phoneticAlgorithm?: 'cologne' | 'soundex' | 'metaphone';
  threshold?: number;
  dateFormat?: string;
  numericTolerance?: number;
}

export interface MatchResult {
  overallScore: number;
  fieldScores: Record<string, number>;
  matchLevel: 'exact' | 'high' | 'medium' | 'low' | 'none';
  confidence: number;
  flags: string[];
}

export interface RecordPair<T = Record<string, unknown>> {
  record1: T;
  record2: T;
}

/**
 * Calculate similarity score for a single field
 */
export function calculateFieldSimilarity(
  value1: unknown,
  value2: unknown,
  algorithm: MatchAlgorithm,
  options: MatchOptions = {}
): number {
  // Handle null/undefined
  if (value1 === null || value1 === undefined) return value2 === null || value2 === undefined ? 1 : 0;
  if (value2 === null || value2 === undefined) return 0;

  const str1 = String(value1);
  const str2 = String(value2);

  // Empty string handling
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  switch (algorithm) {
    case 'exact':
      return options.caseSensitive
        ? str1 === str2 ? 1 : 0
        : str1.toLowerCase() === str2.toLowerCase() ? 1 : 0;

    case 'levenshtein':
      return levenshteinSimilarity(str1, str2, {
        caseSensitive: options.caseSensitive,
        normalize: options.normalize,
      });

    case 'damerau':
      return damerauLevenshteinSimilarity(str1, str2, {
        caseSensitive: options.caseSensitive,
        normalize: options.normalize,
      });

    case 'jaro_winkler':
      return jaroWinklerSimilarity(str1, str2, {
        caseSensitive: options.caseSensitive,
        normalize: options.normalize,
      });

    case 'token_jaro':
      return tokenJaroWinkler(str1, str2, {
        caseSensitive: options.caseSensitive,
        normalize: options.normalize,
      });

    case 'phonetic':
      return phoneticSimilarity(str1, str2, {
        algorithm: options.phoneticAlgorithm || 'cologne',
      });

    case 'token_phonetic':
      return tokenPhoneticSimilarity(str1, str2, {
        algorithm: options.phoneticAlgorithm || 'cologne',
      });

    case 'numeric':
      return calculateNumericSimilarity(value1, value2, options.numericTolerance || 0);

    case 'date':
      return calculateDateSimilarity(value1, value2);

    case 'composite':
      // Use weighted combination of multiple algorithms
      return calculateCompositeSimilarity(str1, str2, options);

    default:
      return jaroWinklerSimilarity(str1, str2);
  }
}

/**
 * Calculate numeric similarity with tolerance
 */
function calculateNumericSimilarity(
  value1: unknown,
  value2: unknown,
  tolerance: number
): number {
  const num1 = parseFloat(String(value1).replace(/[^\d.-]/g, ''));
  const num2 = parseFloat(String(value2).replace(/[^\d.-]/g, ''));

  if (isNaN(num1) || isNaN(num2)) return 0;
  if (num1 === num2) return 1;

  const diff = Math.abs(num1 - num2);
  const avg = (Math.abs(num1) + Math.abs(num2)) / 2;

  if (avg === 0) return diff === 0 ? 1 : 0;

  const percentDiff = diff / avg;
  if (percentDiff <= tolerance) return 1;

  return Math.max(0, 1 - percentDiff);
}

/**
 * Calculate date similarity
 */
function calculateDateSimilarity(value1: unknown, value2: unknown): number {
  const date1 = new Date(String(value1));
  const date2 = new Date(String(value2));

  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
  if (date1.getTime() === date2.getTime()) return 1;

  // Same day
  if (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  ) {
    return 1;
  }

  // Within a week
  const diffDays = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return 0.9;
  if (diffDays <= 30) return 0.7;
  if (diffDays <= 365) return 0.5;

  return 0.3;
}

/**
 * Calculate composite similarity using multiple algorithms
 */
function calculateCompositeSimilarity(
  str1: string,
  str2: string,
  options: MatchOptions = {}
): number {
  const jaro = jaroWinklerSimilarity(str1, str2, {
    caseSensitive: options.caseSensitive,
    normalize: options.normalize,
  });

  const levenshtein = levenshteinSimilarity(str1, str2, {
    caseSensitive: options.caseSensitive,
    normalize: options.normalize,
  });

  const phonetic = phoneticSimilarity(str1, str2, {
    algorithm: options.phoneticAlgorithm || 'cologne',
  });

  // Weighted average favoring the best match
  const scores = [jaro, levenshtein, phonetic].sort((a, b) => b - a);
  return scores[0] * 0.5 + scores[1] * 0.3 + scores[2] * 0.2;
}

/**
 * Compare two records using field configurations
 */
export function compareRecords<T extends Record<string, unknown>>(
  record1: T,
  record2: T,
  fieldConfigs: FieldMatchConfig[]
): MatchResult {
  const fieldScores: Record<string, number> = {};
  const flags: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  let requiredFieldsFailed = false;

  for (const config of fieldConfigs) {
    const value1 = getNestedValue(record1, config.field);
    const value2 = getNestedValue(record2, config.field);

    const score = calculateFieldSimilarity(
      value1,
      value2,
      config.algorithm,
      config.options
    );

    fieldScores[config.field] = score;

    // Apply exact match bonus
    if (score === 1 && config.exactMatchBonus) {
      weightedSum += config.weight * (1 + config.exactMatchBonus);
    } else {
      weightedSum += config.weight * score;
    }
    totalWeight += config.weight;

    // Check required fields
    if (config.required && score < (config.options?.threshold || 0.7)) {
      requiredFieldsFailed = true;
      flags.push(`required_failed:${config.field}`);
    }

    // Add flags for notable matches
    if (score === 1) {
      flags.push(`exact:${config.field}`);
    } else if (score >= 0.9) {
      flags.push(`high:${config.field}`);
    }
  }

  const overallScore = requiredFieldsFailed ? 0 : totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine match level
  let matchLevel: MatchResult['matchLevel'];
  if (overallScore >= 0.95) {
    matchLevel = 'exact';
  } else if (overallScore >= 0.85) {
    matchLevel = 'high';
  } else if (overallScore >= 0.7) {
    matchLevel = 'medium';
  } else if (overallScore >= 0.5) {
    matchLevel = 'low';
  } else {
    matchLevel = 'none';
  }

  // Calculate confidence based on number of matching fields
  const highScoreFields = Object.values(fieldScores).filter((s) => s >= 0.8).length;
  const confidence = highScoreFields / fieldConfigs.length;

  return {
    overallScore,
    fieldScores,
    matchLevel,
    confidence,
    flags,
  };
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = obj;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Standard field configurations for common entity types
 */
export const STANDARD_MATCH_CONFIGS = {
  person: [
    { field: 'firstName', weight: 1.5, algorithm: 'jaro_winkler' as MatchAlgorithm, exactMatchBonus: 0.1 },
    { field: 'lastName', weight: 2, algorithm: 'jaro_winkler' as MatchAlgorithm, required: true, exactMatchBonus: 0.15 },
    { field: 'lastName', weight: 1, algorithm: 'phonetic' as MatchAlgorithm },
    { field: 'email', weight: 3, algorithm: 'exact' as MatchAlgorithm, options: { caseSensitive: false } },
    { field: 'phone', weight: 2, algorithm: 'numeric' as MatchAlgorithm },
    { field: 'dateOfBirth', weight: 1.5, algorithm: 'date' as MatchAlgorithm },
    { field: 'address.postalCode', weight: 1, algorithm: 'exact' as MatchAlgorithm },
    { field: 'address.city', weight: 0.5, algorithm: 'phonetic' as MatchAlgorithm },
  ],

  company: [
    { field: 'name', weight: 3, algorithm: 'token_jaro' as MatchAlgorithm, required: true },
    { field: 'name', weight: 1, algorithm: 'token_phonetic' as MatchAlgorithm },
    { field: 'vatId', weight: 4, algorithm: 'exact' as MatchAlgorithm, exactMatchBonus: 0.2 },
    { field: 'registrationNumber', weight: 4, algorithm: 'exact' as MatchAlgorithm, exactMatchBonus: 0.2 },
    { field: 'email', weight: 2, algorithm: 'exact' as MatchAlgorithm, options: { caseSensitive: false } },
    { field: 'phone', weight: 1.5, algorithm: 'numeric' as MatchAlgorithm },
    { field: 'address.street', weight: 1, algorithm: 'token_jaro' as MatchAlgorithm },
    { field: 'address.postalCode', weight: 1, algorithm: 'exact' as MatchAlgorithm },
    { field: 'address.city', weight: 0.5, algorithm: 'phonetic' as MatchAlgorithm },
  ],

  address: [
    { field: 'street', weight: 2, algorithm: 'token_jaro' as MatchAlgorithm, required: true },
    { field: 'houseNumber', weight: 1.5, algorithm: 'exact' as MatchAlgorithm },
    { field: 'postalCode', weight: 2, algorithm: 'exact' as MatchAlgorithm, required: true },
    { field: 'city', weight: 1.5, algorithm: 'phonetic' as MatchAlgorithm },
    { field: 'country', weight: 0.5, algorithm: 'exact' as MatchAlgorithm },
  ],

  product: [
    { field: 'sku', weight: 5, algorithm: 'exact' as MatchAlgorithm },
    { field: 'ean', weight: 5, algorithm: 'exact' as MatchAlgorithm },
    { field: 'name', weight: 2, algorithm: 'token_jaro' as MatchAlgorithm },
    { field: 'manufacturer', weight: 1, algorithm: 'jaro_winkler' as MatchAlgorithm },
    { field: 'category', weight: 0.5, algorithm: 'exact' as MatchAlgorithm },
  ],
};

/**
 * Composite scorer class for batch matching
 */
export class CompositeScorer {
  private fieldConfigs: FieldMatchConfig[];

  constructor(fieldConfigs: FieldMatchConfig[]) {
    this.fieldConfigs = fieldConfigs;
  }

  compare<T extends Record<string, unknown>>(record1: T, record2: T): MatchResult {
    return compareRecords(record1, record2, this.fieldConfigs);
  }

  findMatches<T extends Record<string, unknown>>(
    target: T,
    candidates: T[],
    minScore = 0.7
  ): Array<{ record: T; result: MatchResult }> {
    return candidates
      .map((record) => ({
        record,
        result: this.compare(target, record),
      }))
      .filter((m) => m.result.overallScore >= minScore)
      .sort((a, b) => b.result.overallScore - a.result.overallScore);
  }

  findDuplicates<T extends Record<string, unknown>>(
    records: T[],
    minScore = 0.8
  ): Array<{ pair: [T, T]; result: MatchResult }> {
    const duplicates: Array<{ pair: [T, T]; result: MatchResult }> = [];

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const result = this.compare(records[i], records[j]);
        if (result.overallScore >= minScore) {
          duplicates.push({ pair: [records[i], records[j]], result });
        }
      }
    }

    return duplicates.sort((a, b) => b.result.overallScore - a.result.overallScore);
  }
}

export const createCompositeScorer = (fieldConfigs: FieldMatchConfig[]) =>
  new CompositeScorer(fieldConfigs);

export const createPersonScorer = () =>
  new CompositeScorer(STANDARD_MATCH_CONFIGS.person);

export const createCompanyScorer = () =>
  new CompositeScorer(STANDARD_MATCH_CONFIGS.company);

export const createAddressScorer = () =>
  new CompositeScorer(STANDARD_MATCH_CONFIGS.address);

export const createProductScorer = () =>
  new CompositeScorer(STANDARD_MATCH_CONFIGS.product);

export default {
  calculateFieldSimilarity,
  compareRecords,
  CompositeScorer,
  createCompositeScorer,
  createPersonScorer,
  createCompanyScorer,
  createAddressScorer,
  createProductScorer,
  STANDARD_MATCH_CONFIGS,
};
