/**
 * DACH Business Terminology Mapper
 * T080 - Create DACH business terminology mapper
 */

import { type SupportedLanguage } from './languageDetector.js';

// =============================================================================
// Types
// =============================================================================

interface TermMapping {
  en: string;
  de: string;
  at?: string; // Austrian variation
  ch?: string; // Swiss variation
  category: string;
}

// =============================================================================
// Terminology Database
// =============================================================================

const BUSINESS_TERMS: TermMapping[] = [
  // Finance & Accounting
  { en: 'invoice', de: 'Rechnung', category: 'finance' },
  { en: 'accounts receivable', de: 'Forderungen', at: 'Debitoren', category: 'finance' },
  { en: 'accounts payable', de: 'Verbindlichkeiten', at: 'Kreditoren', category: 'finance' },
  { en: 'balance sheet', de: 'Bilanz', category: 'finance' },
  { en: 'income statement', de: 'Gewinn- und Verlustrechnung', at: 'GuV', category: 'finance' },
  { en: 'tax', de: 'Steuer', category: 'finance' },
  { en: 'VAT', de: 'Umsatzsteuer', at: 'USt', ch: 'MWST', category: 'finance' },
  { en: 'fiscal year', de: 'Geschäftsjahr', category: 'finance' },
  { en: 'audit', de: 'Prüfung', at: 'Revision', category: 'finance' },
  { en: 'budget', de: 'Budget', at: 'Haushalt', category: 'finance' },
  { en: 'cost center', de: 'Kostenstelle', category: 'finance' },
  { en: 'profit center', de: 'Profitcenter', category: 'finance' },

  // HR & Personnel
  { en: 'employee', de: 'Mitarbeiter', category: 'hr' },
  { en: 'employer', de: 'Arbeitgeber', category: 'hr' },
  { en: 'employment contract', de: 'Arbeitsvertrag', at: 'Dienstvertrag', category: 'hr' },
  { en: 'payroll', de: 'Lohnabrechnung', at: 'Gehaltsverrechnung', category: 'hr' },
  { en: 'works council', de: 'Betriebsrat', category: 'hr' },
  { en: 'leave', de: 'Urlaub', category: 'hr' },
  { en: 'sick leave', de: 'Krankenstand', at: 'Krankmeldung', category: 'hr' },
  { en: 'pension', de: 'Rente', at: 'Pension', ch: 'AHV', category: 'hr' },
  { en: 'onboarding', de: 'Einarbeitung', category: 'hr' },
  { en: 'termination', de: 'Kündigung', category: 'hr' },
  { en: 'probation period', de: 'Probezeit', category: 'hr' },

  // Legal & Compliance
  { en: 'GDPR', de: 'DSGVO', category: 'legal' },
  { en: 'data protection', de: 'Datenschutz', category: 'legal' },
  { en: 'compliance', de: 'Compliance', at: 'Regelkonformität', category: 'legal' },
  { en: 'contract', de: 'Vertrag', category: 'legal' },
  { en: 'terms and conditions', de: 'AGB', category: 'legal' },
  { en: 'liability', de: 'Haftung', category: 'legal' },
  { en: 'power of attorney', de: 'Vollmacht', at: 'Bevollmächtigung', category: 'legal' },
  { en: 'trade register', de: 'Handelsregister', at: 'Firmenbuch', category: 'legal' },

  // Operations
  { en: 'process', de: 'Prozess', at: 'Vorgang', category: 'operations' },
  { en: 'workflow', de: 'Arbeitsablauf', category: 'operations' },
  { en: 'approval', de: 'Genehmigung', at: 'Freigabe', category: 'operations' },
  { en: 'deadline', de: 'Frist', at: 'Termin', category: 'operations' },
  { en: 'department', de: 'Abteilung', category: 'operations' },
  { en: 'meeting', de: 'Besprechung', at: 'Sitzung', ch: 'Meeting', category: 'operations' },
  { en: 'minutes', de: 'Protokoll', category: 'operations' },
  { en: 'escalation', de: 'Eskalation', category: 'operations' },

  // Sales & Customer
  { en: 'customer', de: 'Kunde', category: 'sales' },
  { en: 'order', de: 'Bestellung', at: 'Auftrag', category: 'sales' },
  { en: 'quotation', de: 'Angebot', at: 'Offert', ch: 'Offerte', category: 'sales' },
  { en: 'purchase order', de: 'Bestellauftrag', category: 'sales' },
  { en: 'delivery', de: 'Lieferung', category: 'sales' },
  { en: 'shipping', de: 'Versand', category: 'sales' },
  { en: 'return', de: 'Retoure', at: 'Rücksendung', category: 'sales' },
  { en: 'discount', de: 'Rabatt', at: 'Nachlass', category: 'sales' },

  // IT & Technical
  { en: 'system', de: 'System', category: 'it' },
  { en: 'interface', de: 'Schnittstelle', category: 'it' },
  { en: 'database', de: 'Datenbank', category: 'it' },
  { en: 'backup', de: 'Datensicherung', at: 'Backup', category: 'it' },
  { en: 'access rights', de: 'Zugriffsrechte', category: 'it' },
  { en: 'password', de: 'Passwort', at: 'Kennwort', category: 'it' },
  { en: 'update', de: 'Aktualisierung', category: 'it' },
];

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Map term to target language
 */
export function mapTerm(
  term: string,
  targetLanguage: SupportedLanguage,
  region?: 'de' | 'at' | 'ch'
): string {
  const lowerTerm = term.toLowerCase();

  for (const mapping of BUSINESS_TERMS) {
    const enMatch = mapping.en.toLowerCase() === lowerTerm;
    const deMatch = mapping.de.toLowerCase() === lowerTerm;
    const atMatch = mapping.at?.toLowerCase() === lowerTerm;
    const chMatch = mapping.ch?.toLowerCase() === lowerTerm;

    if (enMatch || deMatch || atMatch || chMatch) {
      if (targetLanguage === 'de') {
        // Use regional variation if available and requested
        if (region === 'at' && mapping.at) return mapping.at;
        if (region === 'ch' && mapping.ch) return mapping.ch;
        return mapping.de;
      } else {
        return mapping.en;
      }
    }
  }

  // Return original if no mapping found
  return term;
}

/**
 * Translate all known terms in text
 */
export function translateTerms(
  text: string,
  targetLanguage: SupportedLanguage,
  region?: 'de' | 'at' | 'ch'
): string {
  let result = text;

  for (const mapping of BUSINESS_TERMS) {
    const sourceTerms = targetLanguage === 'de'
      ? [mapping.en]
      : [mapping.de, mapping.at, mapping.ch].filter(Boolean) as string[];

    for (const sourceTerm of sourceTerms) {
      const pattern = new RegExp(`\\b${escapeRegex(sourceTerm)}\\b`, 'gi');
      const targetTerm = targetLanguage === 'de'
        ? (region === 'at' && mapping.at ? mapping.at : region === 'ch' && mapping.ch ? mapping.ch : mapping.de)
        : mapping.en;

      result = result.replace(pattern, (match) => {
        // Preserve case
        if (match[0] === match[0].toUpperCase()) {
          return targetTerm.charAt(0).toUpperCase() + targetTerm.slice(1);
        }
        return targetTerm;
      });
    }
  }

  return result;
}

/**
 * Get all terms for a category
 */
export function getTermsByCategory(category: string): TermMapping[] {
  return BUSINESS_TERMS.filter(t => t.category === category);
}

/**
 * Get term suggestions based on partial match
 */
export function suggestTerms(
  partial: string,
  language: SupportedLanguage,
  limit: number = 5
): string[] {
  const lowerPartial = partial.toLowerCase();
  const matches: Array<{ term: string; score: number }> = [];

  for (const mapping of BUSINESS_TERMS) {
    const term = language === 'de' ? mapping.de : mapping.en;
    const lowerTerm = term.toLowerCase();

    if (lowerTerm.includes(lowerPartial)) {
      // Score based on position of match
      const score = lowerTerm.startsWith(lowerPartial) ? 1 : 0.5;
      matches.push({ term, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.term);
}

/**
 * Check if term exists in dictionary
 */
export function isKnownTerm(term: string): boolean {
  const lowerTerm = term.toLowerCase();

  return BUSINESS_TERMS.some(mapping =>
    mapping.en.toLowerCase() === lowerTerm ||
    mapping.de.toLowerCase() === lowerTerm ||
    mapping.at?.toLowerCase() === lowerTerm ||
    mapping.ch?.toLowerCase() === lowerTerm
  );
}

/**
 * Get term info
 */
export function getTermInfo(term: string): TermMapping | null {
  const lowerTerm = term.toLowerCase();

  return BUSINESS_TERMS.find(mapping =>
    mapping.en.toLowerCase() === lowerTerm ||
    mapping.de.toLowerCase() === lowerTerm ||
    mapping.at?.toLowerCase() === lowerTerm ||
    mapping.ch?.toLowerCase() === lowerTerm
  ) || null;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  mapTerm,
  translateTerms,
  getTermsByCategory,
  suggestTerms,
  isKnownTerm,
  getTermInfo,
  BUSINESS_TERMS,
};
