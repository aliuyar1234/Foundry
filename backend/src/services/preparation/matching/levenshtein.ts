/**
 * Levenshtein Distance Similarity Scorer
 * Calculates edit distance between strings and converts to similarity score
 */

export interface LevenshteinOptions {
  caseSensitive?: boolean;
  normalize?: boolean;
  insertCost?: number;
  deleteCost?: number;
  replaceCost?: number;
}

/**
 * Calculate Levenshtein distance between two strings
 * Uses dynamic programming with space optimization (O(min(m,n)) space)
 */
export function levenshteinDistance(
  str1: string,
  str2: string,
  options: LevenshteinOptions = {}
): number {
  const {
    caseSensitive = false,
    normalize = true,
    insertCost = 1,
    deleteCost = 1,
    replaceCost = 1,
  } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  // Handle edge cases
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length * insertCost;
  if (s2.length === 0) return s1.length * deleteCost;

  // Ensure s1 is the shorter string for space optimization
  if (s1.length > s2.length) {
    [s1, s2] = [s2, s1];
  }

  const m = s1.length;
  const n = s2.length;

  // Use single row for space efficiency
  let prevRow = new Array(m + 1);
  let currRow = new Array(m + 1);

  // Initialize first row
  for (let i = 0; i <= m; i++) {
    prevRow[i] = i * deleteCost;
  }

  // Fill the matrix
  for (let j = 1; j <= n; j++) {
    currRow[0] = j * insertCost;

    for (let i = 1; i <= m; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : replaceCost;

      currRow[i] = Math.min(
        prevRow[i] + insertCost,      // Insertion
        currRow[i - 1] + deleteCost,   // Deletion
        prevRow[i - 1] + cost          // Substitution
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m];
}

/**
 * Calculate Levenshtein similarity (0-1 range)
 */
export function levenshteinSimilarity(
  str1: string,
  str2: string,
  options: LevenshteinOptions = {}
): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const distance = levenshteinDistance(str1, str2, options);
  const maxLength = Math.max(str1.length, str2.length);

  return 1 - distance / maxLength;
}

/**
 * Damerau-Levenshtein distance (includes transposition)
 * Useful for typo detection
 */
export function damerauLevenshteinDistance(
  str1: string,
  str2: string,
  options: LevenshteinOptions = {}
): number {
  const { caseSensitive = false, normalize = true } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const m = s1.length;
  const n = s2.length;

  // Create matrix
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = new Array(n + 1).fill(0);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;

      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // Deletion
        d[i][j - 1] + 1,        // Insertion
        d[i - 1][j - 1] + cost  // Substitution
      );

      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        s1[i - 1] === s2[j - 2] &&
        s1[i - 2] === s2[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[m][n];
}

/**
 * Damerau-Levenshtein similarity (0-1 range)
 */
export function damerauLevenshteinSimilarity(
  str1: string,
  str2: string,
  options: LevenshteinOptions = {}
): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const distance = damerauLevenshteinDistance(str1, str2, options);
  const maxLength = Math.max(str1.length, str2.length);

  return 1 - distance / maxLength;
}

/**
 * Weighted Levenshtein with keyboard distance
 * Penalizes typos less if keys are adjacent on keyboard
 */
export function weightedLevenshteinDistance(
  str1: string,
  str2: string,
  options: LevenshteinOptions = {}
): number {
  const { caseSensitive = false, normalize = true } = options;

  let s1 = caseSensitive ? str1 : str1.toLowerCase();
  let s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (normalize) {
    s1 = normalizeString(s1);
    s2 = normalizeString(s2);
  }

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const m = s1.length;
  const n = s2.length;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = new Array(n + 1).fill(0);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const char1 = s1[i - 1];
      const char2 = s2[j - 1];

      let cost = 0;
      if (char1 !== char2) {
        cost = getKeyboardDistance(char1, char2);
      }

      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[m][n];
}

/**
 * Get keyboard distance between two characters (QWERTZ layout for German)
 */
function getKeyboardDistance(char1: string, char2: string): number {
  const keyboard: Record<string, [number, number]> = {
    // Row 0
    '1': [0, 0], '2': [0, 1], '3': [0, 2], '4': [0, 3], '5': [0, 4],
    '6': [0, 5], '7': [0, 6], '8': [0, 7], '9': [0, 8], '0': [0, 9],
    // Row 1 (QWERTZ)
    'q': [1, 0], 'w': [1, 1], 'e': [1, 2], 'r': [1, 3], 't': [1, 4],
    'z': [1, 5], 'u': [1, 6], 'i': [1, 7], 'o': [1, 8], 'p': [1, 9],
    // Row 2
    'a': [2, 0], 's': [2, 1], 'd': [2, 2], 'f': [2, 3], 'g': [2, 4],
    'h': [2, 5], 'j': [2, 6], 'k': [2, 7], 'l': [2, 8],
    // Row 3
    'y': [3, 0], 'x': [3, 1], 'c': [3, 2], 'v': [3, 3], 'b': [3, 4],
    'n': [3, 5], 'm': [3, 6],
  };

  const pos1 = keyboard[char1.toLowerCase()];
  const pos2 = keyboard[char2.toLowerCase()];

  if (!pos1 || !pos2) return 1;

  const rowDiff = Math.abs(pos1[0] - pos2[0]);
  const colDiff = Math.abs(pos1[1] - pos2[1]);

  // Adjacent keys have distance 0.5, further keys scale up
  if (rowDiff <= 1 && colDiff <= 1) return 0.5;
  if (rowDiff <= 2 && colDiff <= 2) return 0.75;
  return 1;
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein scorer for batch comparison
 */
export class LevenshteinScorer {
  private options: LevenshteinOptions;

  constructor(options: LevenshteinOptions = {}) {
    this.options = options;
  }

  score(str1: string, str2: string): number {
    return levenshteinSimilarity(str1, str2, this.options);
  }

  distance(str1: string, str2: string): number {
    return levenshteinDistance(str1, str2, this.options);
  }

  scoreWithTransposition(str1: string, str2: string): number {
    return damerauLevenshteinSimilarity(str1, str2, this.options);
  }
}

export const createLevenshteinScorer = (options?: LevenshteinOptions) =>
  new LevenshteinScorer(options);

export default {
  levenshteinDistance,
  levenshteinSimilarity,
  damerauLevenshteinDistance,
  damerauLevenshteinSimilarity,
  weightedLevenshteinDistance,
  LevenshteinScorer,
  createLevenshteinScorer,
};
