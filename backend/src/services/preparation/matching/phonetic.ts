/**
 * Phonetic Matching Scorer
 * Implements Cologne Phonetic algorithm optimized for German/DACH names
 * Also includes Soundex and Double Metaphone for comparison
 */

export interface PhoneticOptions {
  algorithm?: 'cologne' | 'soundex' | 'metaphone' | 'all';
  normalize?: boolean;
}

/**
 * Cologne Phonetic Algorithm
 * German phonetic algorithm, better for DACH region names than Soundex
 */
export function colognePhonetic(str: string): string {
  if (!str) return '';

  // Normalize and uppercase
  let s = str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // German umlaut handling
  s = s
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/ß/g, 'SS');

  // Remove non-alpha
  s = s.replace(/[^A-Z]/g, '');

  if (!s) return '';

  const codes: string[] = [];
  const len = s.length;

  for (let i = 0; i < len; i++) {
    const char = s[i];
    const prev = i > 0 ? s[i - 1] : '';
    const next = i < len - 1 ? s[i + 1] : '';

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
        // H is ignored
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
        } else if (['S', 'Z'].includes(prev)) {
          code = '8';
        } else {
          code = ['A', 'H', 'K', 'O', 'Q', 'U', 'X'].includes(next) ? '4' : '8';
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

    if (code) {
      codes.push(code);
    }
  }

  // Remove consecutive duplicates
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

  // Remove zeros (except keep at least one digit)
  const withoutZeros = result.replace(/0/g, '');
  return withoutZeros || '0';
}

/**
 * Soundex Algorithm
 * American phonetic algorithm
 */
export function soundex(str: string): string {
  if (!str) return '';

  const s = str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

  if (!s) return '';

  const firstLetter = s[0];
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

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]];
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
 * Double Metaphone Algorithm (Simplified)
 * More accurate than Soundex for English names
 */
export function metaphone(str: string): string {
  if (!str) return '';

  let s = str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

  if (!s) return '';

  // Handle initial letter combinations
  if (s.startsWith('KN') || s.startsWith('GN') || s.startsWith('PN') || s.startsWith('WR')) {
    s = s.substring(1);
  } else if (s.startsWith('AE')) {
    s = 'E' + s.substring(2);
  } else if (s.startsWith('X')) {
    s = 'S' + s.substring(1);
  } else if (s.startsWith('WH')) {
    s = 'W' + s.substring(2);
  }

  // Process string
  let result = '';
  let i = 0;

  while (i < s.length && result.length < 8) {
    const char = s[i];
    const next = s[i + 1] || '';
    const next2 = s[i + 2] || '';

    switch (char) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
        if (i === 0) result += char;
        break;

      case 'B':
        result += 'P';
        if (next === 'B') i++;
        break;

      case 'C':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' || next === 'E' || next === 'Y') {
          result += 'S';
        } else {
          result += 'K';
        }
        if (next === 'C' || next === 'K') i++;
        break;

      case 'D':
        if (next === 'G' && ['E', 'I', 'Y'].includes(next2)) {
          result += 'J';
          i += 2;
        } else {
          result += 'T';
          if (next === 'D') i++;
        }
        break;

      case 'F':
        result += 'F';
        if (next === 'F') i++;
        break;

      case 'G':
        if (next === 'H') {
          if (i > 0 && !'AEIOU'.includes(s[i - 1])) {
            i++;
          } else {
            result += 'K';
            i++;
          }
        } else if (next === 'N') {
          if (i === s.length - 2) {
            // GN at end - silent
          } else {
            result += 'KN';
          }
          i++;
        } else if (['E', 'I', 'Y'].includes(next)) {
          result += 'J';
        } else {
          result += 'K';
        }
        if (next === 'G') i++;
        break;

      case 'H':
        if (i === 0 || !'AEIOU'.includes(s[i - 1])) {
          if ('AEIOU'.includes(next)) {
            result += 'H';
          }
        }
        break;

      case 'J':
        result += 'J';
        if (next === 'J') i++;
        break;

      case 'K':
        result += 'K';
        if (next === 'K') i++;
        break;

      case 'L':
        result += 'L';
        if (next === 'L') i++;
        break;

      case 'M':
        result += 'M';
        if (next === 'M') i++;
        break;

      case 'N':
        result += 'N';
        if (next === 'N') i++;
        break;

      case 'P':
        if (next === 'H') {
          result += 'F';
          i++;
        } else {
          result += 'P';
          if (next === 'P') i++;
        }
        break;

      case 'Q':
        result += 'K';
        break;

      case 'R':
        result += 'R';
        if (next === 'R') i++;
        break;

      case 'S':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' && (next2 === 'O' || next2 === 'A')) {
          result += 'X';
        } else {
          result += 'S';
        }
        if (next === 'S') i++;
        break;

      case 'T':
        if (next === 'H') {
          result += '0'; // TH
          i++;
        } else if (next === 'I' && (next2 === 'O' || next2 === 'A')) {
          result += 'X';
        } else {
          result += 'T';
        }
        if (next === 'T') i++;
        break;

      case 'V':
        result += 'F';
        if (next === 'V') i++;
        break;

      case 'W':
        if ('AEIOU'.includes(next)) {
          result += 'W';
        }
        break;

      case 'X':
        result += 'KS';
        if (next === 'X') i++;
        break;

      case 'Y':
        if ('AEIOU'.includes(next)) {
          result += 'Y';
        }
        break;

      case 'Z':
        result += 'S';
        if (next === 'Z') i++;
        break;
    }

    i++;
  }

  return result;
}

/**
 * Calculate phonetic similarity between two strings
 */
export function phoneticSimilarity(
  str1: string,
  str2: string,
  options: PhoneticOptions = {}
): number {
  const { algorithm = 'cologne' } = options;

  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  switch (algorithm) {
    case 'cologne': {
      const code1 = colognePhonetic(str1);
      const code2 = colognePhonetic(str2);
      return code1 === code2 ? 1 : calculateCodeSimilarity(code1, code2);
    }

    case 'soundex': {
      const code1 = soundex(str1);
      const code2 = soundex(str2);
      return code1 === code2 ? 1 : calculateCodeSimilarity(code1, code2);
    }

    case 'metaphone': {
      const code1 = metaphone(str1);
      const code2 = metaphone(str2);
      return code1 === code2 ? 1 : calculateCodeSimilarity(code1, code2);
    }

    case 'all': {
      // Average of all algorithms
      const cologne = phoneticSimilarity(str1, str2, { algorithm: 'cologne' });
      const sdx = phoneticSimilarity(str1, str2, { algorithm: 'soundex' });
      const meta = phoneticSimilarity(str1, str2, { algorithm: 'metaphone' });
      return (cologne + sdx + meta) / 3;
    }

    default:
      return 0;
  }
}

/**
 * Calculate similarity between phonetic codes
 */
function calculateCodeSimilarity(code1: string, code2: string): number {
  if (code1 === code2) return 1;
  if (!code1 || !code2) return 0;

  // Calculate Levenshtein-like similarity on codes
  const maxLen = Math.max(code1.length, code2.length);
  let matches = 0;

  const minLen = Math.min(code1.length, code2.length);
  for (let i = 0; i < minLen; i++) {
    if (code1[i] === code2[i]) matches++;
  }

  // Prefix bonus
  let prefixLen = 0;
  for (let i = 0; i < minLen; i++) {
    if (code1[i] === code2[i]) {
      prefixLen++;
    } else {
      break;
    }
  }

  const matchScore = matches / maxLen;
  const prefixBonus = prefixLen > 0 ? 0.1 * (prefixLen / minLen) : 0;

  return Math.min(1, matchScore + prefixBonus);
}

/**
 * Token-based phonetic matching for multi-word strings
 */
export function tokenPhoneticSimilarity(
  str1: string,
  str2: string,
  options: PhoneticOptions = {}
): number {
  const { algorithm = 'cologne' } = options;

  const tokens1 = str1.split(/\s+/).filter((t) => t.length > 0);
  const tokens2 = str2.split(/\s+/).filter((t) => t.length > 0);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Generate phonetic codes for each token
  const getCode = (s: string) => {
    switch (algorithm) {
      case 'cologne':
        return colognePhonetic(s);
      case 'soundex':
        return soundex(s);
      case 'metaphone':
        return metaphone(s);
      default:
        return colognePhonetic(s);
    }
  };

  const codes1 = tokens1.map(getCode);
  const codes2 = tokens2.map(getCode);

  // Match tokens by phonetic code
  const used2 = new Set<number>();
  let matches = 0;

  for (const code1 of codes1) {
    for (let j = 0; j < codes2.length; j++) {
      if (used2.has(j)) continue;
      if (code1 === codes2[j]) {
        used2.add(j);
        matches++;
        break;
      }
    }
  }

  const maxTokens = Math.max(tokens1.length, tokens2.length);
  return matches / maxTokens;
}

/**
 * Phonetic scorer class
 */
export class PhoneticScorer {
  private options: PhoneticOptions;

  constructor(options: PhoneticOptions = {}) {
    this.options = { algorithm: 'cologne', ...options };
  }

  score(str1: string, str2: string): number {
    return phoneticSimilarity(str1, str2, this.options);
  }

  tokenScore(str1: string, str2: string): number {
    return tokenPhoneticSimilarity(str1, str2, this.options);
  }

  encode(str: string): string {
    switch (this.options.algorithm) {
      case 'cologne':
        return colognePhonetic(str);
      case 'soundex':
        return soundex(str);
      case 'metaphone':
        return metaphone(str);
      default:
        return colognePhonetic(str);
    }
  }

  matches(str1: string, str2: string): boolean {
    return this.encode(str1) === this.encode(str2);
  }
}

export const createPhoneticScorer = (options?: PhoneticOptions) =>
  new PhoneticScorer(options);

export default {
  colognePhonetic,
  soundex,
  metaphone,
  phoneticSimilarity,
  tokenPhoneticSimilarity,
  PhoneticScorer,
  createPhoneticScorer,
};
