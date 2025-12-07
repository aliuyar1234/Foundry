/**
 * Language Detector Service
 * T078 - Create language detector for queries
 */

// =============================================================================
// Types
// =============================================================================

export type SupportedLanguage = 'en' | 'de';

interface DetectionResult {
  language: SupportedLanguage;
  confidence: number;
}

// =============================================================================
// Language Indicators
// =============================================================================

const GERMAN_INDICATORS = [
  // Common German words
  /\b(und|oder|aber|wenn|weil|dass|nicht|auch|noch|schon|mehr|sehr)\b/gi,
  // German articles
  /\b(der|die|das|ein|eine|einer|einem|einen)\b/gi,
  // German pronouns
  /\b(ich|du|er|sie|es|wir|ihr|Sie|mein|dein|sein|ihr|unser|euer)\b/gi,
  // German verbs
  /\b(ist|sind|war|waren|haben|hat|wird|werden|kann|können|muss|müssen)\b/gi,
  // German question words
  /\b(was|wer|wie|wo|wann|warum|welche|welcher|welches)\b/gi,
  // German prepositions
  /\b(in|an|auf|aus|bei|mit|nach|von|zu|für|über|unter)\b/gi,
  // German umlauts and ß
  /[äöüÄÖÜß]/g,
  // German business terms
  /\b(Rechnung|Bestellung|Kunde|Mitarbeiter|Abteilung|Prozess|Bericht)\b/gi,
];

const ENGLISH_INDICATORS = [
  // Common English words
  /\b(the|a|an|and|or|but|if|because|that|not|also|still|more|very)\b/gi,
  // English pronouns
  /\b(I|you|he|she|it|we|they|my|your|his|her|its|our|their)\b/gi,
  // English verbs
  /\b(is|are|was|were|have|has|will|would|can|could|must|should)\b/gi,
  // English question words
  /\b(what|who|how|where|when|why|which)\b/gi,
  // English prepositions
  /\b(in|at|on|from|with|to|for|about|over|under)\b/gi,
  // English business terms
  /\b(invoice|order|customer|employee|department|process|report)\b/gi,
];

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Detect the language of a text
 */
export function detectLanguage(text: string): SupportedLanguage {
  const result = detectLanguageWithConfidence(text);
  return result.language;
}

/**
 * Detect language with confidence score
 */
export function detectLanguageWithConfidence(text: string): DetectionResult {
  const cleanText = text.toLowerCase().trim();

  if (cleanText.length < 3) {
    return { language: 'en', confidence: 0.5 }; // Default to English for very short texts
  }

  let germanScore = 0;
  let englishScore = 0;

  // Count German indicators
  for (const pattern of GERMAN_INDICATORS) {
    const matches = cleanText.match(pattern);
    if (matches) {
      germanScore += matches.length;
    }
  }

  // Count English indicators
  for (const pattern of ENGLISH_INDICATORS) {
    const matches = cleanText.match(pattern);
    if (matches) {
      englishScore += matches.length;
    }
  }

  // Check for explicit language indicators
  if (/^(de|german|deutsch):/i.test(text)) {
    return { language: 'de', confidence: 1.0 };
  }
  if (/^(en|english|englisch):/i.test(text)) {
    return { language: 'en', confidence: 1.0 };
  }

  // Calculate confidence
  const totalScore = germanScore + englishScore;
  if (totalScore === 0) {
    return { language: 'en', confidence: 0.5 }; // Default to English
  }

  const germanConfidence = germanScore / totalScore;
  const englishConfidence = englishScore / totalScore;

  if (germanConfidence > englishConfidence) {
    return {
      language: 'de',
      confidence: germanConfidence,
    };
  } else {
    return {
      language: 'en',
      confidence: englishConfidence,
    };
  }
}

/**
 * Check if text contains multiple languages
 */
export function isMultilingual(text: string): boolean {
  const result = detectLanguageWithConfidence(text);
  // If confidence is between 0.4 and 0.6, it might be multilingual
  return result.confidence >= 0.4 && result.confidence <= 0.6;
}

/**
 * Get preferred response language based on input
 */
export function getResponseLanguage(
  inputLanguage: SupportedLanguage,
  userPreference?: SupportedLanguage,
  sessionLanguage?: SupportedLanguage
): SupportedLanguage {
  // Priority: user preference > session language > detected input language
  if (userPreference) return userPreference;
  if (sessionLanguage) return sessionLanguage;
  return inputLanguage;
}

export default {
  detectLanguage,
  detectLanguageWithConfidence,
  isMultilingual,
  getResponseLanguage,
};
