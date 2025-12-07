/**
 * Response Formatter Service
 * T079 - Implement German/English response formatter
 */

import { type SupportedLanguage } from './languageDetector.js';

// =============================================================================
// Types
// =============================================================================

interface FormattingOptions {
  addCitations?: boolean;
  addDisclaimer?: boolean;
  formatLists?: boolean;
  highlightKeyTerms?: boolean;
}

// =============================================================================
// Localized Strings
// =============================================================================

const LOCALIZED = {
  disclaimer: {
    en: 'Note: This information is based on available data and may not reflect the most recent changes.',
    de: 'Hinweis: Diese Informationen basieren auf verfügbaren Daten und spiegeln möglicherweise nicht die neuesten Änderungen wider.',
  },
  noInfoFound: {
    en: "I couldn't find specific information about this topic. Please try rephrasing your question or contact the relevant department.",
    de: 'Ich konnte keine spezifischen Informationen zu diesem Thema finden. Bitte formulieren Sie Ihre Frage um oder wenden Sie sich an die zuständige Abteilung.',
  },
  sources: {
    en: 'Sources',
    de: 'Quellen',
  },
  seeAlso: {
    en: 'See also',
    de: 'Siehe auch',
  },
  contactFor: {
    en: 'For more information, contact',
    de: 'Für weitere Informationen wenden Sie sich an',
  },
};

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Format response for output
 */
export function formatResponse(
  content: string,
  language: SupportedLanguage,
  options: FormattingOptions = {}
): string {
  let formatted = content;

  // Format lists consistently
  if (options.formatLists !== false) {
    formatted = formatLists(formatted);
  }

  // Format headings
  formatted = formatHeadings(formatted, language);

  // Highlight key business terms
  if (options.highlightKeyTerms) {
    formatted = highlightBusinessTerms(formatted, language);
  }

  // Add disclaimer if needed
  if (options.addDisclaimer) {
    formatted += `\n\n*${LOCALIZED.disclaimer[language]}*`;
  }

  return formatted.trim();
}

/**
 * Format lists in response
 */
function formatLists(content: string): string {
  // Ensure consistent list formatting
  let result = content;

  // Convert various list formats to consistent markdown
  result = result.replace(/^[•·◦]\s*/gm, '- ');
  result = result.replace(/^(\d+)\)\s*/gm, '$1. ');

  // Add spacing after lists
  result = result.replace(/^(-|\d+\.)\s+(.+)$/gm, (match, marker, text) => {
    return `${marker} ${text}`;
  });

  return result;
}

/**
 * Format headings based on language
 */
function formatHeadings(content: string, language: SupportedLanguage): string {
  let result = content;

  // Translate common headings
  const headingTranslations: Record<string, { en: string; de: string }> = {
    summary: { en: 'Summary', de: 'Zusammenfassung' },
    overview: { en: 'Overview', de: 'Überblick' },
    details: { en: 'Details', de: 'Details' },
    recommendations: { en: 'Recommendations', de: 'Empfehlungen' },
    'next steps': { en: 'Next Steps', de: 'Nächste Schritte' },
    conclusion: { en: 'Conclusion', de: 'Fazit' },
  };

  for (const [key, translations] of Object.entries(headingTranslations)) {
    const targetHeading = translations[language];
    const otherLanguage = language === 'en' ? 'de' : 'en';
    const sourceHeading = translations[otherLanguage];

    // Replace headings in wrong language
    const headingPattern = new RegExp(`^(#+)\\s*${sourceHeading}\\s*:?\\s*$`, 'gim');
    result = result.replace(headingPattern, `$1 ${targetHeading}`);
  }

  return result;
}

/**
 * Highlight important business terms
 */
function highlightBusinessTerms(content: string, language: SupportedLanguage): string {
  const businessTerms = language === 'de'
    ? ['Rechnung', 'Bestellung', 'Genehmigung', 'Prozess', 'Mitarbeiter', 'Abteilung', 'Projekt', 'Frist', 'Budget']
    : ['Invoice', 'Order', 'Approval', 'Process', 'Employee', 'Department', 'Project', 'Deadline', 'Budget'];

  let result = content;

  for (const term of businessTerms) {
    const pattern = new RegExp(`\\b(${term})\\b`, 'gi');
    result = result.replace(pattern, '**$1**');
  }

  // Avoid double bolding
  result = result.replace(/\*\*\*\*(.+?)\*\*\*\*/g, '**$1**');

  return result;
}

/**
 * Format response with citations
 */
export function formatWithCitations(
  content: string,
  citations: Array<{ title: string; source: string }>,
  language: SupportedLanguage
): string {
  let result = content;

  if (citations.length > 0) {
    result += `\n\n### ${LOCALIZED.sources[language]}\n`;
    for (let i = 0; i < citations.length; i++) {
      result += `${i + 1}. ${citations[i].title} (${citations[i].source})\n`;
    }
  }

  return result;
}

/**
 * Format error message
 */
export function formatErrorMessage(
  errorType: 'not_found' | 'permission_denied' | 'processing_error',
  language: SupportedLanguage
): string {
  const errorMessages: Record<typeof errorType, { en: string; de: string }> = {
    not_found: LOCALIZED.noInfoFound,
    permission_denied: {
      en: 'You do not have permission to access this information. Please contact your administrator.',
      de: 'Sie haben keine Berechtigung, auf diese Informationen zuzugreifen. Bitte wenden Sie sich an Ihren Administrator.',
    },
    processing_error: {
      en: 'An error occurred while processing your request. Please try again later.',
      de: 'Bei der Verarbeitung Ihrer Anfrage ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
    },
  };

  return errorMessages[errorType][language];
}

/**
 * Format suggested follow-up questions
 */
export function formatSuggestedQuestions(
  questions: string[],
  language: SupportedLanguage
): string {
  const header = language === 'de'
    ? 'Sie könnten auch fragen:'
    : 'You might also ask:';

  return `\n\n**${header}**\n${questions.map(q => `- ${q}`).join('\n')}`;
}

/**
 * Clean and normalize whitespace
 */
export function cleanWhitespace(content: string): string {
  return content
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]+$/gm, '') // Remove trailing spaces
    .replace(/^[ \t]+/gm, (match, offset, string) => {
      // Preserve indentation for lists
      const prevChar = string[offset - 1];
      if (prevChar === '\n' || offset === 0) {
        return match.slice(0, 4); // Max 4 spaces indentation
      }
      return '';
    })
    .trim();
}

export default {
  formatResponse,
  formatWithCitations,
  formatErrorMessage,
  formatSuggestedQuestions,
  cleanWhitespace,
};
