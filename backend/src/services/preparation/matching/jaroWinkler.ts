/**
 * Jaro-Winkler Similarity Scorer
 * Optimized for short strings like names
 * Gives higher scores to strings with matching prefixes
 */

export interface JaroWinklerOptions {
  caseSensitive?: boolean;
  normalize?: boolean;
  prefixScale?: number; // Default 0.1, max 0.25
  prefixLength?: number; // Max prefix length to consider (default 4)
}

/**
 * Calculate Jaro similarity between two strings
 */
export function jaroSimilarity(
  str1: string,
  str2: string,
  options: JaroWinklerOptions = {}
): number {
  const { caseSensitive = false, normalize = true } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  // Handle edge cases
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Calculate match window
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  // Calculate Jaro similarity
  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Calculate Jaro-Winkler similarity
 * Adds prefix bonus to Jaro similarity
 */
export function jaroWinklerSimilarity(
  str1: string,
  str2: string,
  options: JaroWinklerOptions = {}
): number {
  const {
    caseSensitive = false,
    normalize = true,
    prefixScale = 0.1,
    prefixLength = 4,
  } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  // Get Jaro similarity
  const jaro = jaroSimilarity(s1, s2, { caseSensitive: true, normalize: false });

  // Calculate common prefix length (max 4 characters typically)
  const maxPrefix = Math.min(prefixLength, s1.length, s2.length);
  let prefix = 0;

  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  // Ensure prefix scale doesn't exceed 0.25
  const scale = Math.min(prefixScale, 0.25);

  // Jaro-Winkler formula
  return jaro + prefix * scale * (1 - jaro);
}

/**
 * Calculate Jaro-Winkler distance (1 - similarity)
 */
export function jaroWinklerDistance(
  str1: string,
  str2: string,
  options: JaroWinklerOptions = {}
): number {
  return 1 - jaroWinklerSimilarity(str1, str2, options);
}

/**
 * Jaro-Winkler with penalty for length difference
 * Better for comparing strings that should be similar in length
 */
export function jaroWinklerWithLengthPenalty(
  str1: string,
  str2: string,
  options: JaroWinklerOptions = {}
): number {
  const similarity = jaroWinklerSimilarity(str1, str2, options);

  // Apply length penalty
  const lengthDiff = Math.abs(str1.length - str2.length);
  const avgLength = (str1.length + str2.length) / 2;
  const lengthPenalty = lengthDiff / avgLength;

  // Reduce similarity based on length difference
  return similarity * (1 - lengthPenalty * 0.5);
}

/**
 * Compare multiple string pairs and return sorted by similarity
 */
export function findBestMatches(
  target: string,
  candidates: string[],
  options: JaroWinklerOptions = {},
  minSimilarity = 0.7
): Array<{ candidate: string; similarity: number }> {
  const results = candidates
    .map((candidate) => ({
      candidate,
      similarity: jaroWinklerSimilarity(target, candidate, options),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return results;
}

/**
 * Token-based Jaro-Winkler for multi-word strings
 * Handles word order differences (e.g., "John Smith" vs "Smith, John")
 */
export function tokenJaroWinkler(
  str1: string,
  str2: string,
  options: JaroWinklerOptions = {}
): number {
  const { caseSensitive = false, normalize = true } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  // Split into tokens
  const tokens1 = s1.split(/\s+/).filter((t) => t.length > 0);
  const tokens2 = s2.split(/\s+/).filter((t) => t.length > 0);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // If single tokens, use standard comparison
  if (tokens1.length === 1 && tokens2.length === 1) {
    return jaroWinklerSimilarity(tokens1[0], tokens2[0], { caseSensitive: true, normalize: false });
  }

  // Find best token matches
  const used2 = new Set<number>();
  let totalSimilarity = 0;

  for (const token1 of tokens1) {
    let bestSimilarity = 0;
    let bestIndex = -1;

    for (let i = 0; i < tokens2.length; i++) {
      if (used2.has(i)) continue;

      const sim = jaroWinklerSimilarity(token1, tokens2[i], {
        caseSensitive: true,
        normalize: false,
      });

      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      used2.add(bestIndex);
      totalSimilarity += bestSimilarity;
    }
  }

  // Average over the longer token list
  const maxTokens = Math.max(tokens1.length, tokens2.length);
  return totalSimilarity / maxTokens;
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaro-Winkler scorer class for batch operations
 */
export class JaroWinklerScorer {
  private options: JaroWinklerOptions;

  constructor(options: JaroWinklerOptions = {}) {
    this.options = options;
  }

  score(str1: string, str2: string): number {
    return jaroWinklerSimilarity(str1, str2, this.options);
  }

  jaro(str1: string, str2: string): number {
    return jaroSimilarity(str1, str2, this.options);
  }

  tokenScore(str1: string, str2: string): number {
    return tokenJaroWinkler(str1, str2, this.options);
  }

  findMatches(
    target: string,
    candidates: string[],
    minSimilarity = 0.7
  ): Array<{ candidate: string; similarity: number }> {
    return findBestMatches(target, candidates, this.options, minSimilarity);
  }
}

export const createJaroWinklerScorer = (options?: JaroWinklerOptions) =>
  new JaroWinklerScorer(options);

export default {
  jaroSimilarity,
  jaroWinklerSimilarity,
  jaroWinklerDistance,
  jaroWinklerWithLengthPenalty,
  tokenJaroWinkler,
  findBestMatches,
  JaroWinklerScorer,
  createJaroWinklerScorer,
};
