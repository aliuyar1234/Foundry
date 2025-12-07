/**
 * DACH Address Normalizer
 * Normalizes addresses for Germany, Austria, and Switzerland
 */

export interface Address {
  street?: string;
  houseNumber?: string;
  addition?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
}

export interface NormalizedAddress extends Address {
  normalized: {
    streetNormalized: string;
    cityNormalized: string;
    fullAddress: string;
  };
  validation: {
    isValid: boolean;
    issues: string[];
    postalCodeValid: boolean;
    countryDetected: string | null;
  };
}

/**
 * German state abbreviations
 */
const GERMAN_STATES: Record<string, string> = {
  'baden-württemberg': 'BW',
  'baden-wuerttemberg': 'BW',
  'bayern': 'BY',
  'bavaria': 'BY',
  'berlin': 'BE',
  'brandenburg': 'BB',
  'bremen': 'HB',
  'hamburg': 'HH',
  'hessen': 'HE',
  'mecklenburg-vorpommern': 'MV',
  'niedersachsen': 'NI',
  'nordrhein-westfalen': 'NW',
  'rheinland-pfalz': 'RP',
  'saarland': 'SL',
  'sachsen': 'SN',
  'sachsen-anhalt': 'ST',
  'schleswig-holstein': 'SH',
  'thüringen': 'TH',
  'thueringen': 'TH',
};

/**
 * Austrian state abbreviations
 */
const AUSTRIAN_STATES: Record<string, string> = {
  'burgenland': 'B',
  'kärnten': 'K',
  'kaernten': 'K',
  'niederösterreich': 'NÖ',
  'niederoesterreich': 'NÖ',
  'oberösterreich': 'OÖ',
  'oberoesterreich': 'OÖ',
  'salzburg': 'S',
  'steiermark': 'ST',
  'tirol': 'T',
  'vorarlberg': 'V',
  'wien': 'W',
  'vienna': 'W',
};

/**
 * Swiss canton abbreviations
 */
const SWISS_CANTONS: Record<string, string> = {
  'zürich': 'ZH',
  'zuerich': 'ZH',
  'bern': 'BE',
  'luzern': 'LU',
  'uri': 'UR',
  'schwyz': 'SZ',
  'obwalden': 'OW',
  'nidwalden': 'NW',
  'glarus': 'GL',
  'zug': 'ZG',
  'freiburg': 'FR',
  'solothurn': 'SO',
  'basel-stadt': 'BS',
  'basel-landschaft': 'BL',
  'schaffhausen': 'SH',
  'appenzell ausserrhoden': 'AR',
  'appenzell innerrhoden': 'AI',
  'st. gallen': 'SG',
  'graubünden': 'GR',
  'graubuenden': 'GR',
  'aargau': 'AG',
  'thurgau': 'TG',
  'tessin': 'TI',
  'waadt': 'VD',
  'wallis': 'VS',
  'neuenburg': 'NE',
  'genf': 'GE',
  'jura': 'JU',
};

/**
 * Street type abbreviations
 */
const STREET_ABBREVIATIONS: Record<string, string> = {
  'straße': 'str.',
  'strasse': 'str.',
  'str': 'str.',
  'str.': 'str.',
  'weg': 'weg',
  'platz': 'pl.',
  'allee': 'allee',
  'gasse': 'g.',
  'ring': 'ring',
  'damm': 'damm',
  'ufer': 'ufer',
  'chaussee': 'ch.',
  'promenade': 'prom.',
  'boulevard': 'blvd.',
  'avenue': 'ave.',
};

/**
 * Street type expansions (reverse of abbreviations)
 */
const STREET_EXPANSIONS: Record<string, string> = {
  'str.': 'straße',
  'str': 'straße',
  'pl.': 'platz',
  'g.': 'gasse',
  'ch.': 'chaussee',
  'prom.': 'promenade',
  'blvd.': 'boulevard',
  'ave.': 'avenue',
};

/**
 * Normalize a DACH address
 */
export function normalizeAddress(input: Partial<Address> | string): NormalizedAddress {
  const address = typeof input === 'string' ? parseAddressString(input) : { ...input };
  const issues: string[] = [];

  // Normalize street
  const { street, houseNumber, addition } = normalizeStreet(
    address.street || '',
    address.houseNumber,
    address.addition
  );
  address.street = street;
  address.houseNumber = houseNumber;
  address.addition = addition;

  // Normalize postal code
  const { postalCode, country: detectedCountry } = normalizePostalCode(
    address.postalCode || '',
    address.country || address.countryCode
  );
  address.postalCode = postalCode;

  // Detect country from postal code if not provided
  if (!address.country && !address.countryCode && detectedCountry) {
    address.countryCode = detectedCountry;
  }

  // Normalize city
  address.city = normalizeCity(address.city || '');

  // Normalize state
  if (address.state) {
    address.state = normalizeState(address.state, address.countryCode);
  }

  // Normalize country
  if (address.country) {
    const { name, code } = normalizeCountry(address.country);
    address.country = name;
    address.countryCode = code;
  } else if (address.countryCode) {
    const { name, code } = normalizeCountryCode(address.countryCode);
    address.country = name;
    address.countryCode = code;
  }

  // Validate postal code format
  const postalCodeValid = validatePostalCode(address.postalCode || '', address.countryCode || '');
  if (!postalCodeValid && address.postalCode) {
    issues.push('Invalid postal code format');
  }

  // Check for missing required fields
  if (!address.street) issues.push('Missing street');
  if (!address.postalCode) issues.push('Missing postal code');
  if (!address.city) issues.push('Missing city');

  // Build normalized strings
  const streetNormalized = buildNormalizedStreet(street, houseNumber, addition);
  const cityNormalized = normalizeForComparison(address.city || '');
  const fullAddress = buildFullAddress(address);

  return {
    ...address,
    normalized: {
      streetNormalized,
      cityNormalized,
      fullAddress,
    },
    validation: {
      isValid: issues.length === 0,
      issues,
      postalCodeValid,
      countryDetected: detectedCountry,
    },
  };
}

/**
 * Parse a free-form address string
 */
function parseAddressString(input: string): Address {
  const address: Address = {};
  let remaining = input.trim();

  // Try to extract postal code and city (German format: "12345 Berlin")
  const postalCityMatch = remaining.match(/(\d{4,5})\s+([A-Za-zäöüÄÖÜß\s-]+?)(?:,|$)/);
  if (postalCityMatch) {
    address.postalCode = postalCityMatch[1];
    address.city = postalCityMatch[2].trim();
    remaining = remaining.replace(postalCityMatch[0], '').trim();
  }

  // Try to extract street and house number
  const streetMatch = remaining.match(/^([A-Za-zäöüÄÖÜß\s.-]+?)\s+(\d+[a-zA-Z]?)(?:\s|,|$)/);
  if (streetMatch) {
    address.street = streetMatch[1].trim();
    address.houseNumber = streetMatch[2];
    remaining = remaining.replace(streetMatch[0], '').trim();
  } else {
    // Just use remaining as street
    address.street = remaining.replace(/,/g, '').trim();
  }

  return address;
}

/**
 * Normalize street name and extract house number
 */
function normalizeStreet(
  street: string,
  houseNumber?: string,
  addition?: string
): { street: string; houseNumber?: string; addition?: string } {
  let normalized = street.trim();
  let extractedNumber = houseNumber;
  let extractedAddition = addition;

  // Remove leading/trailing punctuation
  normalized = normalized.replace(/^[,.\s]+|[,.\s]+$/g, '');

  // Try to extract house number if not provided
  if (!extractedNumber) {
    const numberMatch = normalized.match(/\s+(\d+[a-zA-Z]?)(?:\s*[-/]\s*(\d+[a-zA-Z]?))?$/);
    if (numberMatch) {
      extractedNumber = numberMatch[1];
      if (numberMatch[2]) {
        extractedAddition = numberMatch[2];
      }
      normalized = normalized.replace(numberMatch[0], '').trim();
    }
  }

  // Normalize street type suffixes
  for (const [pattern, replacement] of Object.entries(STREET_EXPANSIONS)) {
    const regex = new RegExp(`\\b${pattern.replace('.', '\\.')}$`, 'i');
    if (regex.test(normalized)) {
      normalized = normalized.replace(regex, replacement);
      break;
    }
  }

  // Capitalize first letter of each word
  normalized = normalized
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());

  // Handle German compound street names
  normalized = normalized
    .replace(/strasse\b/gi, 'straße')
    .replace(/Strasse\b/g, 'Straße');

  return {
    street: normalized,
    houseNumber: extractedNumber,
    addition: extractedAddition,
  };
}

/**
 * Normalize postal code and detect country
 */
function normalizePostalCode(
  postalCode: string,
  countryHint?: string
): { postalCode: string; country: string | null } {
  let normalized = postalCode.replace(/\s/g, '').toUpperCase();
  let country: string | null = null;

  // Remove country prefix if present
  const prefixMatch = normalized.match(/^([A-Z]{1,2})[-]?(\d+)$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    normalized = prefixMatch[2];

    if (prefix === 'D') country = 'DE';
    else if (prefix === 'A' || prefix === 'AT') country = 'AT';
    else if (prefix === 'CH') country = 'CH';
  }

  // Detect country from format if not determined
  if (!country && !countryHint) {
    if (/^\d{5}$/.test(normalized)) {
      // Could be Germany
      country = 'DE';
    } else if (/^\d{4}$/.test(normalized)) {
      // Could be Austria or Switzerland
      const firstDigit = parseInt(normalized[0], 10);
      if (firstDigit >= 1 && firstDigit <= 9) {
        // Swiss postal codes: 1000-9658
        // Austrian: 1010-9992
        // Need context to distinguish, default to context or Austria
        country = countryHint?.toUpperCase() === 'CH' ? 'CH' : 'AT';
      }
    }
  }

  return { postalCode: normalized, country };
}

/**
 * Normalize city name
 */
function normalizeCity(city: string): string {
  let normalized = city.trim();

  // Remove postal code if accidentally included
  normalized = normalized.replace(/^\d{4,5}\s*/, '');

  // Remove district suffixes like "(Mitte)"
  normalized = normalized.replace(/\s*\([^)]+\)\s*$/, '');

  // Capitalize properly
  normalized = normalized
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());

  // Handle common city name variations
  const cityNormalizations: Record<string, string> = {
    'muenchen': 'München',
    'munich': 'München',
    'koeln': 'Köln',
    'cologne': 'Köln',
    'nuernberg': 'Nürnberg',
    'nuremberg': 'Nürnberg',
    'frankfurt am main': 'Frankfurt am Main',
    'frankfurt a.m.': 'Frankfurt am Main',
    'frankfurt/main': 'Frankfurt am Main',
    'wien': 'Wien',
    'vienna': 'Wien',
    'zuerich': 'Zürich',
    'zurich': 'Zürich',
    'genf': 'Genf',
    'geneva': 'Genf',
    'geneve': 'Genf',
  };

  const lowerNormalized = normalized.toLowerCase();
  if (cityNormalizations[lowerNormalized]) {
    normalized = cityNormalizations[lowerNormalized];
  }

  return normalized;
}

/**
 * Normalize state/region name
 */
function normalizeState(state: string, countryCode?: string): string {
  const lower = state.toLowerCase().trim();

  if (countryCode === 'DE' || !countryCode) {
    if (GERMAN_STATES[lower]) {
      return GERMAN_STATES[lower];
    }
  }

  if (countryCode === 'AT' || !countryCode) {
    if (AUSTRIAN_STATES[lower]) {
      return AUSTRIAN_STATES[lower];
    }
  }

  if (countryCode === 'CH' || !countryCode) {
    if (SWISS_CANTONS[lower]) {
      return SWISS_CANTONS[lower];
    }
  }

  return state.trim();
}

/**
 * Normalize country name to standard form
 */
function normalizeCountry(country: string): { name: string; code: string } {
  const lower = country.toLowerCase().trim();

  const countryMap: Record<string, { name: string; code: string }> = {
    'germany': { name: 'Deutschland', code: 'DE' },
    'deutschland': { name: 'Deutschland', code: 'DE' },
    'de': { name: 'Deutschland', code: 'DE' },
    'austria': { name: 'Österreich', code: 'AT' },
    'österreich': { name: 'Österreich', code: 'AT' },
    'oesterreich': { name: 'Österreich', code: 'AT' },
    'at': { name: 'Österreich', code: 'AT' },
    'switzerland': { name: 'Schweiz', code: 'CH' },
    'schweiz': { name: 'Schweiz', code: 'CH' },
    'suisse': { name: 'Schweiz', code: 'CH' },
    'svizzera': { name: 'Schweiz', code: 'CH' },
    'ch': { name: 'Schweiz', code: 'CH' },
  };

  return countryMap[lower] || { name: country, code: country.toUpperCase().substring(0, 2) };
}

/**
 * Normalize country code
 */
function normalizeCountryCode(code: string): { name: string; code: string } {
  const upper = code.toUpperCase().trim();

  const codeMap: Record<string, { name: string; code: string }> = {
    'DE': { name: 'Deutschland', code: 'DE' },
    'D': { name: 'Deutschland', code: 'DE' },
    'AT': { name: 'Österreich', code: 'AT' },
    'A': { name: 'Österreich', code: 'AT' },
    'CH': { name: 'Schweiz', code: 'CH' },
  };

  return codeMap[upper] || { name: upper, code: upper };
}

/**
 * Validate postal code format for country
 */
function validatePostalCode(postalCode: string, countryCode: string): boolean {
  const code = countryCode.toUpperCase();

  switch (code) {
    case 'DE':
    case 'D':
      return /^\d{5}$/.test(postalCode);
    case 'AT':
    case 'A':
      return /^\d{4}$/.test(postalCode);
    case 'CH':
      return /^\d{4}$/.test(postalCode);
    default:
      return postalCode.length >= 4;
  }
}

/**
 * Build normalized street string for comparison
 */
function buildNormalizedStreet(
  street: string,
  houseNumber?: string,
  addition?: string
): string {
  let result = normalizeForComparison(street);

  if (houseNumber) {
    result += ` ${houseNumber}`;
    if (addition) {
      result += `-${addition}`;
    }
  }

  return result;
}

/**
 * Build full address string
 */
function buildFullAddress(address: Address): string {
  const parts: string[] = [];

  if (address.street) {
    let streetLine = address.street;
    if (address.houseNumber) {
      streetLine += ` ${address.houseNumber}`;
      if (address.addition) {
        streetLine += `-${address.addition}`;
      }
    }
    parts.push(streetLine);
  }

  if (address.postalCode || address.city) {
    parts.push(`${address.postalCode || ''} ${address.city || ''}`.trim());
  }

  if (address.country) {
    parts.push(address.country);
  }

  return parts.join(', ');
}

/**
 * Normalize string for comparison (lowercase, remove diacritics, simplify)
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  normalizeAddress,
  normalizeStreet,
  normalizeCity,
  normalizePostalCode,
  validatePostalCode,
  GERMAN_STATES,
  AUSTRIAN_STATES,
  SWISS_CANTONS,
};
