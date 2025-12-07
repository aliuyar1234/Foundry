/**
 * Matching Module Index
 * Exports all similarity scoring utilities
 */

export {
  levenshteinDistance,
  levenshteinSimilarity,
  damerauLevenshteinDistance,
  damerauLevenshteinSimilarity,
  weightedLevenshteinDistance,
  LevenshteinScorer,
  createLevenshteinScorer,
  type LevenshteinOptions,
} from './levenshtein.js';

export {
  jaroSimilarity,
  jaroWinklerSimilarity,
  jaroWinklerDistance,
  jaroWinklerWithLengthPenalty,
  tokenJaroWinkler,
  findBestMatches,
  JaroWinklerScorer,
  createJaroWinklerScorer,
  type JaroWinklerOptions,
} from './jaroWinkler.js';

export {
  colognePhonetic,
  soundex,
  metaphone,
  phoneticSimilarity,
  tokenPhoneticSimilarity,
  PhoneticScorer,
  createPhoneticScorer,
  type PhoneticOptions,
} from './phonetic.js';

export {
  calculateFieldSimilarity,
  compareRecords,
  CompositeScorer,
  createCompositeScorer,
  createPersonScorer,
  createCompanyScorer,
  createAddressScorer,
  createProductScorer,
  STANDARD_MATCH_CONFIGS,
  type FieldMatchConfig,
  type MatchAlgorithm,
  type MatchOptions,
  type MatchResult,
  type RecordPair,
} from './compositeScorer.js';
