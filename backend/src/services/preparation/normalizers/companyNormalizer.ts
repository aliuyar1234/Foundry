/**
 * DACH Company Name Normalizer
 * Normalizes company names for Germany, Austria, and Switzerland
 * Handles legal form suffixes (GmbH, AG, etc.) and common variations
 */

export interface CompanyName {
  original: string;
  normalized: string;
  baseName: string;
  legalForm?: string;
  legalFormFull?: string;
  suffix?: string;
  prefix?: string;
  forComparison: string;
}

export interface NormalizedCompany {
  name: CompanyName;
  vatId?: string;
  registrationNumber?: string;
  validation: {
    isValid: boolean;
    issues: string[];
    vatIdValid: boolean;
    hasLegalForm: boolean;
  };
}

/**
 * German legal forms and their variations
 */
const GERMAN_LEGAL_FORMS: Record<string, { full: string; pattern: RegExp }> = {
  'GmbH': {
    full: 'Gesellschaft mit beschränkter Haftung',
    pattern: /\b(gmbh|g\.m\.b\.h\.|gesellschaft\s+m(?:it|\.)\s*b(?:eschränkter|\.)\s*h(?:aftung|\.)?)\b/i,
  },
  'AG': {
    full: 'Aktiengesellschaft',
    pattern: /\b(ag|a\.g\.|aktiengesellschaft)\b/i,
  },
  'KG': {
    full: 'Kommanditgesellschaft',
    pattern: /\b(kg|k\.g\.|kommanditgesellschaft)\b/i,
  },
  'OHG': {
    full: 'Offene Handelsgesellschaft',
    pattern: /\b(ohg|o\.h\.g\.|offene\s+handelsgesellschaft)\b/i,
  },
  'GmbH & Co. KG': {
    full: 'GmbH & Co. Kommanditgesellschaft',
    pattern: /\b(gmbh\s*[&+]\s*co\.?\s*kg|gmbh\s*und\s*co\.?\s*kg)\b/i,
  },
  'UG': {
    full: 'Unternehmergesellschaft (haftungsbeschränkt)',
    pattern: /\b(ug|u\.g\.|unternehmergesellschaft)(\s*\(haftungsbeschr[äa]nkt\))?/i,
  },
  'e.K.': {
    full: 'eingetragener Kaufmann',
    pattern: /\b(e\.?\s*k\.?|eingetragener?\s+kaufmann)\b/i,
  },
  'e.V.': {
    full: 'eingetragener Verein',
    pattern: /\b(e\.?\s*v\.?|eingetragener?\s+verein)\b/i,
  },
  'GbR': {
    full: 'Gesellschaft bürgerlichen Rechts',
    pattern: /\b(gbr|g\.b\.r\.|gesellschaft\s+b[üu]rgerlichen\s+rechts)\b/i,
  },
  'KGaA': {
    full: 'Kommanditgesellschaft auf Aktien',
    pattern: /\b(kgaa|k\.g\.a\.a\.|kommanditgesellschaft\s+auf\s+aktien)\b/i,
  },
  'SE': {
    full: 'Societas Europaea',
    pattern: /\b(se|s\.e\.|societas\s+europaea)\b/i,
  },
  'PartG': {
    full: 'Partnerschaftsgesellschaft',
    pattern: /\b(partg|part\.?\s*g\.?|partnerschaftsgesellschaft)\b/i,
  },
  'PartG mbB': {
    full: 'Partnerschaftsgesellschaft mit beschränkter Berufshaftung',
    pattern: /\b(partg\s*mbb|partnerschaftsgesellschaft\s*m(?:it|\.)\s*b(?:eschränkter|\.)\s*b(?:erufshaftung|\.)?)\b/i,
  },
};

/**
 * Austrian legal forms
 */
const AUSTRIAN_LEGAL_FORMS: Record<string, { full: string; pattern: RegExp }> = {
  'GmbH': {
    full: 'Gesellschaft mit beschränkter Haftung',
    pattern: /\b(gmbh|g\.m\.b\.h\.|ges\.?\s*m\.?\s*b\.?\s*h\.?)\b/i,
  },
  'AG': {
    full: 'Aktiengesellschaft',
    pattern: /\b(ag|a\.g\.|aktiengesellschaft)\b/i,
  },
  'KG': {
    full: 'Kommanditgesellschaft',
    pattern: /\b(kg|k\.g\.|kommanditgesellschaft|komm\.?\s*ges\.?)\b/i,
  },
  'OG': {
    full: 'Offene Gesellschaft',
    pattern: /\b(og|o\.g\.|offene\s+gesellschaft)\b/i,
  },
  'GesbR': {
    full: 'Gesellschaft bürgerlichen Rechts',
    pattern: /\b(gesbr|ges\.?\s*b\.?\s*r\.?)\b/i,
  },
  'e.U.': {
    full: 'eingetragenes Unternehmen',
    pattern: /\b(e\.?\s*u\.?|eingetragenes?\s+unternehmen)\b/i,
  },
};

/**
 * Swiss legal forms
 */
const SWISS_LEGAL_FORMS: Record<string, { full: string; pattern: RegExp }> = {
  'AG': {
    full: 'Aktiengesellschaft',
    pattern: /\b(ag|a\.g\.|aktiengesellschaft)\b/i,
  },
  'GmbH': {
    full: 'Gesellschaft mit beschränkter Haftung',
    pattern: /\b(gmbh|g\.m\.b\.h\.)\b/i,
  },
  'SA': {
    full: 'Société Anonyme',
    pattern: /\b(sa|s\.a\.|soci[ée]t[ée]\s+anonyme)\b/i,
  },
  'Sàrl': {
    full: 'Société à responsabilité limitée',
    pattern: /\b(s[àa]rl|s\.?\s*[àa]\.?\s*r\.?\s*l\.?|soci[ée]t[ée]\s+[àa]\s+responsabilit[ée]\s+limit[ée]e)\b/i,
  },
  'KG': {
    full: 'Kommanditgesellschaft',
    pattern: /\b(kg|k\.g\.|kommanditgesellschaft)\b/i,
  },
  'Genossenschaft': {
    full: 'Genossenschaft',
    pattern: /\b(genossenschaft|coop[ée]rative)\b/i,
  },
  'Stiftung': {
    full: 'Stiftung',
    pattern: /\b(stiftung|fondation|foundation)\b/i,
  },
};

/**
 * Common prefixes to remove or handle
 */
const COMPANY_PREFIXES = [
  /^(die|der|das)\s+/i,
  /^(firma|fa\.?)\s+/i,
  /^(herr|frau|dr\.?|prof\.?)\s+/i,
];

/**
 * Common suffixes to normalize
 */
const COMPANY_SUFFIXES = [
  { pattern: /\s*[-–]\s*(international|deutschland|austria|schweiz|gmbh|ag)\s*$/i, remove: false },
  { pattern: /\s+(holding|group|gruppe)\s*$/i, remove: false },
  { pattern: /\s+(germany|austria|switzerland)\s*$/i, remove: true },
];

/**
 * Words to lowercase in company names (German prepositions)
 */
const LOWERCASE_WORDS = new Set([
  'und', 'und', 'oder', 'für', 'fuer', 'mit', 'bei', 'von', 'zu', 'am', 'im', 'an', 'in',
  'and', 'or', 'for', 'with', 'at', 'of', 'to',
  'et', 'ou', 'pour', 'avec', 'de', 'du',
]);

/**
 * Normalize a company name
 */
export function normalizeCompanyName(
  name: string,
  options: { preserveLegalForm?: boolean; country?: string } = {}
): CompanyName {
  const { preserveLegalForm = true, country } = options;
  const original = name.trim();
  let working = original;
  let legalForm: string | undefined;
  let legalFormFull: string | undefined;
  let prefix: string | undefined;
  let suffix: string | undefined;

  // Extract and remove prefixes
  for (const prefixPattern of COMPANY_PREFIXES) {
    const match = working.match(prefixPattern);
    if (match) {
      prefix = match[0].trim();
      working = working.replace(prefixPattern, '').trim();
      break;
    }
  }

  // Extract legal form
  const allLegalForms = {
    ...GERMAN_LEGAL_FORMS,
    ...AUSTRIAN_LEGAL_FORMS,
    ...SWISS_LEGAL_FORMS,
  };

  // Check for composite forms first (like "GmbH & Co. KG")
  const compositeMatch = working.match(GERMAN_LEGAL_FORMS['GmbH & Co. KG'].pattern);
  if (compositeMatch) {
    legalForm = 'GmbH & Co. KG';
    legalFormFull = GERMAN_LEGAL_FORMS['GmbH & Co. KG'].full;
    working = working.replace(compositeMatch[0], '').trim();
  } else {
    // Check other legal forms
    for (const [form, { full, pattern }] of Object.entries(allLegalForms)) {
      if (form === 'GmbH & Co. KG') continue; // Already checked
      const match = working.match(pattern);
      if (match) {
        legalForm = form;
        legalFormFull = full;
        working = working.replace(match[0], '').trim();
        break;
      }
    }
  }

  // Handle suffixes
  for (const { pattern, remove } of COMPANY_SUFFIXES) {
    const match = working.match(pattern);
    if (match) {
      suffix = match[0].trim();
      if (remove) {
        working = working.replace(pattern, '').trim();
      }
      break;
    }
  }

  // Clean up the base name
  let baseName = working
    .replace(/\s*[,;]\s*$/g, '') // Remove trailing punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Proper case handling
  baseName = baseName
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      // Keep lowercase for articles/prepositions (except at start)
      if (index > 0 && LOWERCASE_WORDS.has(lower)) {
        return lower;
      }
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Build normalized name
  let normalized = baseName;
  if (preserveLegalForm && legalForm) {
    normalized = `${baseName} ${legalForm}`;
  }

  // Build comparison string (lowercase, no legal form, no special chars)
  const forComparison = baseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    original,
    normalized,
    baseName,
    legalForm,
    legalFormFull,
    suffix,
    prefix,
    forComparison,
  };
}

/**
 * Validate German VAT ID (USt-IdNr.)
 */
export function validateGermanVatId(vatId: string): boolean {
  // Format: DE + 9 digits
  const cleaned = vatId.replace(/\s/g, '').toUpperCase();
  if (!/^DE\d{9}$/.test(cleaned)) return false;

  // Checksum validation (simplified)
  const digits = cleaned.substring(2).split('').map(Number);
  let product = 10;

  for (let i = 0; i < 8; i++) {
    let sum = (digits[i] + product) % 10;
    if (sum === 0) sum = 10;
    product = (2 * sum) % 11;
  }

  const checkDigit = (11 - product) % 10;
  return checkDigit === digits[8];
}

/**
 * Validate Austrian VAT ID (UID-Nummer)
 */
export function validateAustrianVatId(vatId: string): boolean {
  // Format: ATU + 8 digits
  const cleaned = vatId.replace(/\s/g, '').toUpperCase();
  if (!/^ATU\d{8}$/.test(cleaned)) return false;

  // Checksum validation
  const digits = cleaned.substring(3).split('').map(Number);
  const weights = [1, 2, 1, 2, 1, 2, 1];
  let sum = 0;

  for (let i = 0; i < 7; i++) {
    let product = digits[i] * weights[i];
    if (product > 9) product -= 9;
    sum += product;
  }

  const checkDigit = (10 - (sum + 4) % 10) % 10;
  return checkDigit === digits[7];
}

/**
 * Validate Swiss VAT ID (MWST-Nummer)
 */
export function validateSwissVatId(vatId: string): boolean {
  // Format: CHE-XXX.XXX.XXX MWST or CHE + 9 digits
  const cleaned = vatId.replace(/[\s.-]/g, '').toUpperCase().replace(/MWST$/, '');
  if (!/^CHE\d{9}$/.test(cleaned)) return false;

  // Checksum validation (Mod 11)
  const digits = cleaned.substring(3).split('').map(Number);
  const weights = [5, 4, 3, 2, 7, 6, 5, 4];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    sum += digits[i] * weights[i];
  }

  const checkDigit = (11 - (sum % 11)) % 11;
  return checkDigit === digits[8];
}

/**
 * Validate VAT ID based on country
 */
export function validateVatId(vatId: string): { valid: boolean; country?: string } {
  if (!vatId) return { valid: false };

  const cleaned = vatId.replace(/\s/g, '').toUpperCase();

  if (cleaned.startsWith('DE')) {
    return { valid: validateGermanVatId(cleaned), country: 'DE' };
  }
  if (cleaned.startsWith('ATU')) {
    return { valid: validateAustrianVatId(cleaned), country: 'AT' };
  }
  if (cleaned.startsWith('CHE')) {
    return { valid: validateSwissVatId(cleaned), country: 'CH' };
  }

  return { valid: false };
}

/**
 * Format VAT ID with proper formatting
 */
export function formatVatId(vatId: string): string {
  const cleaned = vatId.replace(/[\s.-]/g, '').toUpperCase();

  if (cleaned.startsWith('DE')) {
    return `DE ${cleaned.substring(2)}`;
  }
  if (cleaned.startsWith('ATU')) {
    return `ATU ${cleaned.substring(3)}`;
  }
  if (cleaned.startsWith('CHE')) {
    const digits = cleaned.substring(3).replace(/MWST$/i, '');
    return `CHE-${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6)} MWST`;
  }

  return vatId;
}

/**
 * Normalize full company data
 */
export function normalizeCompany(
  data: {
    name: string;
    vatId?: string;
    registrationNumber?: string;
    country?: string;
  }
): NormalizedCompany {
  const issues: string[] = [];

  // Normalize name
  const name = normalizeCompanyName(data.name, { country: data.country });

  // Validate VAT ID
  let vatIdValid = false;
  if (data.vatId) {
    const vatValidation = validateVatId(data.vatId);
    vatIdValid = vatValidation.valid;
    if (!vatIdValid) {
      issues.push('Invalid VAT ID format');
    }
  }

  // Check for legal form
  const hasLegalForm = !!name.legalForm;
  if (!hasLegalForm) {
    issues.push('No legal form detected');
  }

  return {
    name,
    vatId: data.vatId ? formatVatId(data.vatId) : undefined,
    registrationNumber: data.registrationNumber?.trim(),
    validation: {
      isValid: issues.length === 0,
      issues,
      vatIdValid,
      hasLegalForm,
    },
  };
}

export default {
  normalizeCompanyName,
  normalizeCompany,
  validateVatId,
  validateGermanVatId,
  validateAustrianVatId,
  validateSwissVatId,
  formatVatId,
  GERMAN_LEGAL_FORMS,
  AUSTRIAN_LEGAL_FORMS,
  SWISS_LEGAL_FORMS,
};
