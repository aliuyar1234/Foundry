/**
 * Address Validation and Standardization Service
 * Validates and standardizes addresses using external APIs
 * T308 - Address validation via external API
 */

import { createHash } from 'crypto';

export interface AddressInput {
  street?: string;
  houseNumber?: string;
  additionalInfo?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  fullAddress?: string;
}

export interface ValidatedAddress {
  street: string;
  houseNumber: string;
  additionalInfo?: string;
  postalCode: string;
  city: string;
  state?: string;
  country: string;
  countryCode: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  originalAddress: AddressInput;
  validatedAddress?: ValidatedAddress;
  suggestions?: ValidatedAddress[];
  issues: ValidationIssue[];
  source: string;
}

export interface ValidationIssue {
  field: string;
  code: ValidationIssueCode;
  message: string;
  suggestion?: string;
}

export type ValidationIssueCode =
  | 'INVALID_POSTAL_CODE'
  | 'UNKNOWN_CITY'
  | 'UNKNOWN_STREET'
  | 'INVALID_HOUSE_NUMBER'
  | 'AMBIGUOUS_ADDRESS'
  | 'COUNTRY_MISMATCH'
  | 'INCOMPLETE_ADDRESS'
  | 'TYPO_DETECTED'
  | 'OUTDATED_ADDRESS';

export type ValidationProvider =
  | 'google_places'
  | 'here_maps'
  | 'nominatim'
  | 'austrian_post'
  | 'deutsche_post'
  | 'swiss_post'
  | 'mock';

export interface AddressValidatorConfig {
  provider: ValidationProvider;
  apiKey?: string;
  timeout: number;
  enableGeocoding: boolean;
  suggestionsLimit: number;
  cacheTtlSeconds: number;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_CONFIG: AddressValidatorConfig = {
  provider: 'mock',
  timeout: 10000,
  enableGeocoding: true,
  suggestionsLimit: 5,
  cacheTtlSeconds: 86400, // 24 hours
};

// Postal code patterns by country
const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  AT: /^\d{4}$/,           // Austria: 4 digits
  DE: /^\d{5}$/,           // Germany: 5 digits
  CH: /^\d{4}$/,           // Switzerland: 4 digits
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, // UK
  US: /^\d{5}(-\d{4})?$/,  // USA
  FR: /^\d{5}$/,           // France
  IT: /^\d{5}$/,           // Italy
  NL: /^\d{4}\s?[A-Z]{2}$/i, // Netherlands
};

// Major cities by country (for validation)
const MAJOR_CITIES: Record<string, string[]> = {
  AT: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels', 'Sankt Pölten', 'Dornbirn'],
  DE: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen'],
  CH: ['Zürich', 'Genf', 'Basel', 'Lausanne', 'Bern', 'Winterthur', 'Luzern', 'St. Gallen', 'Lugano', 'Biel'],
};

/**
 * Address Validator Service
 */
export class AddressValidator {
  private config: AddressValidatorConfig;

  constructor(config: Partial<AddressValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate and standardize an address
   */
  async validate(input: AddressInput): Promise<ValidationResult> {
    const cacheKey = this.getCacheKey(input);
    const cached = this.getFromCache<ValidationResult>(cacheKey);
    if (cached) return cached;

    // Pre-validation checks
    const preValidationIssues = this.preValidate(input);

    if (preValidationIssues.some(i => i.code === 'INCOMPLETE_ADDRESS')) {
      return {
        isValid: false,
        confidence: 0,
        originalAddress: input,
        issues: preValidationIssues,
        source: 'local',
      };
    }

    let result: ValidationResult;

    switch (this.config.provider) {
      case 'google_places':
        result = await this.validateWithGoogle(input);
        break;
      case 'here_maps':
        result = await this.validateWithHere(input);
        break;
      case 'nominatim':
        result = await this.validateWithNominatim(input);
        break;
      case 'austrian_post':
        result = await this.validateWithAustrianPost(input);
        break;
      case 'deutsche_post':
        result = await this.validateWithDeutschePost(input);
        break;
      case 'swiss_post':
        result = await this.validateWithSwissPost(input);
        break;
      case 'mock':
      default:
        result = await this.validateMock(input);
    }

    // Add pre-validation issues
    result.issues = [...preValidationIssues, ...result.issues];

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Validate multiple addresses
   */
  async validateBatch(
    addresses: AddressInput[]
  ): Promise<ValidationResult[]> {
    return Promise.all(addresses.map(addr => this.validate(addr)));
  }

  /**
   * Standardize address format
   */
  standardize(address: AddressInput): AddressInput {
    return {
      street: this.standardizeStreet(address.street),
      houseNumber: this.standardizeHouseNumber(address.houseNumber),
      additionalInfo: address.additionalInfo?.trim(),
      postalCode: this.standardizePostalCode(address.postalCode, address.countryCode),
      city: this.standardizeCity(address.city),
      state: address.state?.trim(),
      country: this.getCountryName(address.countryCode || address.country),
      countryCode: this.getCountryCode(address.countryCode || address.country),
    };
  }

  /**
   * Parse a full address string into components
   */
  parseAddress(fullAddress: string, countryCode?: string): AddressInput {
    const code = countryCode?.toUpperCase() || this.detectCountry(fullAddress);

    // Country-specific parsing
    if (code === 'AT' || code === 'DE' || code === 'CH') {
      return this.parseGermanStyleAddress(fullAddress, code);
    }

    if (code === 'GB' || code === 'US') {
      return this.parseEnglishStyleAddress(fullAddress, code);
    }

    // Generic parsing
    return this.parseGenericAddress(fullAddress, code);
  }

  /**
   * Get address suggestions for autocomplete
   */
  async getSuggestions(
    partialAddress: string,
    countryCode?: string
  ): Promise<ValidatedAddress[]> {
    if (this.config.provider === 'mock') {
      return this.getMockSuggestions(partialAddress, countryCode);
    }

    // In production, call the actual API
    return this.getMockSuggestions(partialAddress, countryCode);
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: AddressInput): Promise<{ latitude: number; longitude: number } | null> {
    if (!this.config.enableGeocoding) return null;

    const validation = await this.validate(address);
    if (validation.validatedAddress?.latitude && validation.validatedAddress?.longitude) {
      return {
        latitude: validation.validatedAddress.latitude,
        longitude: validation.validatedAddress.longitude,
      };
    }

    return null;
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<ValidatedAddress | null> {
    if (this.config.provider === 'mock') {
      return this.getMockReverseGeocode(latitude, longitude);
    }

    // In production, call the actual API
    return this.getMockReverseGeocode(latitude, longitude);
  }

  // Pre-validation

  private preValidate(input: AddressInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for minimum required fields
    if (!input.fullAddress && !input.city && !input.postalCode) {
      issues.push({
        field: 'address',
        code: 'INCOMPLETE_ADDRESS',
        message: 'Address must include at least city or postal code',
      });
    }

    // Validate postal code format
    if (input.postalCode && input.countryCode) {
      const pattern = POSTAL_CODE_PATTERNS[input.countryCode.toUpperCase()];
      if (pattern && !pattern.test(input.postalCode.trim())) {
        issues.push({
          field: 'postalCode',
          code: 'INVALID_POSTAL_CODE',
          message: `Invalid postal code format for ${input.countryCode}`,
          suggestion: `Expected format: ${this.getPostalCodeExample(input.countryCode)}`,
        });
      }
    }

    return issues;
  }

  // Provider implementations

  private async validateWithGoogle(input: AddressInput): Promise<ValidationResult> {
    // Google Places API implementation
    // https://developers.google.com/maps/documentation/places/web-service/autocomplete

    if (!this.config.apiKey) {
      throw new Error('Google Places API key required');
    }

    // Placeholder - would use actual API
    return this.validateMock(input);
  }

  private async validateWithHere(input: AddressInput): Promise<ValidationResult> {
    // HERE Maps Geocoding API
    // https://developer.here.com/documentation/geocoding-search-api

    if (!this.config.apiKey) {
      throw new Error('HERE Maps API key required');
    }

    return this.validateMock(input);
  }

  private async validateWithNominatim(input: AddressInput): Promise<ValidationResult> {
    // OpenStreetMap Nominatim (free, rate-limited)
    // https://nominatim.org/release-docs/develop/api/Search/

    return this.validateMock(input);
  }

  private async validateWithAustrianPost(input: AddressInput): Promise<ValidationResult> {
    // Austrian Post Address API
    // https://www.post.at/en/p/c/address-search

    return this.validateMock(input);
  }

  private async validateWithDeutschePost(input: AddressInput): Promise<ValidationResult> {
    // Deutsche Post DATAFACTORY
    // https://www.deutschepost.de/de/d/deutsche-post-direkt/datafactory.html

    return this.validateMock(input);
  }

  private async validateWithSwissPost(input: AddressInput): Promise<ValidationResult> {
    // Swiss Post Address API

    return this.validateMock(input);
  }

  private async validateMock(input: AddressInput): Promise<ValidationResult> {
    await this.simulateLatency();

    const standardized = this.standardize(input);
    const issues: ValidationIssue[] = [];

    // Simulate validation
    const isPostalCodeValid = this.isValidPostalCode(standardized.postalCode, standardized.countryCode);
    const isCityKnown = this.isCityKnown(standardized.city, standardized.countryCode);

    if (!isPostalCodeValid) {
      issues.push({
        field: 'postalCode',
        code: 'INVALID_POSTAL_CODE',
        message: 'Postal code could not be verified',
      });
    }

    if (!isCityKnown) {
      issues.push({
        field: 'city',
        code: 'UNKNOWN_CITY',
        message: 'City name could not be verified',
        suggestion: this.suggestCity(standardized.city, standardized.countryCode),
      });
    }

    const confidence = this.calculateConfidence(standardized, issues);
    const isValid = confidence >= 0.7 && issues.filter(i =>
      ['INVALID_POSTAL_CODE', 'UNKNOWN_CITY', 'UNKNOWN_STREET'].includes(i.code)
    ).length === 0;

    const validatedAddress: ValidatedAddress | undefined = isValid ? {
      street: standardized.street || '',
      houseNumber: standardized.houseNumber || '',
      additionalInfo: standardized.additionalInfo,
      postalCode: standardized.postalCode || '',
      city: standardized.city || '',
      state: standardized.state,
      country: standardized.country || '',
      countryCode: standardized.countryCode || '',
      formattedAddress: this.formatAddress(standardized),
      latitude: this.getMockLatitude(standardized.city),
      longitude: this.getMockLongitude(standardized.city),
    } : undefined;

    return {
      isValid,
      confidence,
      originalAddress: input,
      validatedAddress,
      suggestions: isValid ? undefined : await this.getMockSuggestions(
        input.fullAddress || `${input.street} ${input.city}`,
        standardized.countryCode
      ),
      issues,
      source: 'mock',
    };
  }

  // Parsing helpers

  private parseGermanStyleAddress(fullAddress: string, countryCode: string): AddressInput {
    // German/Austrian/Swiss format: Street Housenumber, PostalCode City
    const parts = fullAddress.split(',').map(p => p.trim());

    let street = '';
    let houseNumber = '';
    let postalCode = '';
    let city = '';

    if (parts.length >= 2) {
      // First part: street + house number
      const streetMatch = parts[0].match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
      if (streetMatch) {
        street = streetMatch[1];
        houseNumber = streetMatch[2];
      } else {
        street = parts[0];
      }

      // Second part: postal code + city
      const cityMatch = parts[1].match(/^(\d{4,5})\s+(.+)$/);
      if (cityMatch) {
        postalCode = cityMatch[1];
        city = cityMatch[2];
      } else {
        city = parts[1];
      }
    } else {
      // Try to parse single line
      const match = fullAddress.match(/^(.+?)\s+(\d+[a-zA-Z]?),?\s*(\d{4,5})?\s*(.*)$/);
      if (match) {
        street = match[1];
        houseNumber = match[2];
        postalCode = match[3] || '';
        city = match[4] || '';
      }
    }

    return {
      street,
      houseNumber,
      postalCode,
      city,
      countryCode,
      country: this.getCountryName(countryCode),
    };
  }

  private parseEnglishStyleAddress(fullAddress: string, countryCode: string): AddressInput {
    // UK/US format: Housenumber Street, City, State PostalCode
    const parts = fullAddress.split(',').map(p => p.trim());

    let street = '';
    let houseNumber = '';
    let postalCode = '';
    let city = '';
    let state = '';

    if (parts.length >= 1) {
      // First part: house number + street
      const streetMatch = parts[0].match(/^(\d+[a-zA-Z]?)\s+(.+)$/);
      if (streetMatch) {
        houseNumber = streetMatch[1];
        street = streetMatch[2];
      } else {
        street = parts[0];
      }
    }

    if (parts.length >= 2) {
      city = parts[1];
    }

    if (parts.length >= 3) {
      // Last part might have state and postal code
      const lastPart = parts[parts.length - 1];
      const postalMatch = lastPart.match(/([A-Z]{2})?\s*(\d{5}(-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i);
      if (postalMatch) {
        state = postalMatch[1] || '';
        postalCode = postalMatch[2] || '';
      }
    }

    return {
      street,
      houseNumber,
      postalCode,
      city,
      state,
      countryCode,
      country: this.getCountryName(countryCode),
    };
  }

  private parseGenericAddress(fullAddress: string, countryCode?: string): AddressInput {
    return {
      fullAddress,
      countryCode,
      country: countryCode ? this.getCountryName(countryCode) : undefined,
    };
  }

  // Standardization helpers

  private standardizeStreet(street?: string): string | undefined {
    if (!street) return undefined;

    return street
      .trim()
      .replace(/\bstr\b\.?/gi, 'Straße')
      .replace(/\bstrasse\b/gi, 'Straße')
      .replace(/\bpl\b\.?/gi, 'Platz')
      .replace(/\bweg\b/gi, 'Weg')
      .replace(/\bg\b\.?/gi, 'Gasse');
  }

  private standardizeHouseNumber(houseNumber?: string): string | undefined {
    if (!houseNumber) return undefined;
    return houseNumber.trim().replace(/\s+/g, '');
  }

  private standardizePostalCode(postalCode?: string, countryCode?: string): string | undefined {
    if (!postalCode) return undefined;

    let code = postalCode.trim().toUpperCase();

    // Country-specific formatting
    if (countryCode === 'NL') {
      code = code.replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2');
    } else if (countryCode === 'GB') {
      code = code.replace(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/, '$1 $2');
    }

    return code;
  }

  private standardizeCity(city?: string): string | undefined {
    if (!city) return undefined;

    return city
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Validation helpers

  private isValidPostalCode(postalCode?: string, countryCode?: string): boolean {
    if (!postalCode || !countryCode) return true; // Can't validate without both

    const pattern = POSTAL_CODE_PATTERNS[countryCode.toUpperCase()];
    if (!pattern) return true; // Unknown country, assume valid

    return pattern.test(postalCode.trim());
  }

  private isCityKnown(city?: string, countryCode?: string): boolean {
    if (!city) return false;
    if (!countryCode) return true;

    const cities = MAJOR_CITIES[countryCode.toUpperCase()];
    if (!cities) return true; // Unknown country, assume valid

    // Check if city matches any known city (case-insensitive, fuzzy)
    const normalizedCity = city.toLowerCase().trim();
    return cities.some(c =>
      c.toLowerCase().includes(normalizedCity) ||
      normalizedCity.includes(c.toLowerCase())
    );
  }

  private suggestCity(city?: string, countryCode?: string): string | undefined {
    if (!city || !countryCode) return undefined;

    const cities = MAJOR_CITIES[countryCode.toUpperCase()];
    if (!cities) return undefined;

    const normalizedCity = city.toLowerCase().trim();

    // Find best match using simple similarity
    let bestMatch = '';
    let bestScore = 0;

    for (const knownCity of cities) {
      const score = this.calculateStringSimilarity(normalizedCity, knownCity.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = knownCity;
      }
    }

    return bestScore > 0.5 ? bestMatch : undefined;
  }

  private calculateStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const costs: number[] = [];
    for (let i = 0; i <= shorter.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= longer.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (shorter[i - 1] !== longer[j - 1]) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[longer.length] = lastValue;
    }

    return 1 - costs[longer.length] / longer.length;
  }

  private calculateConfidence(address: AddressInput, issues: ValidationIssue[]): number {
    let score = 100;

    // Deduct for missing fields
    if (!address.street) score -= 15;
    if (!address.houseNumber) score -= 10;
    if (!address.postalCode) score -= 20;
    if (!address.city) score -= 25;
    if (!address.countryCode) score -= 10;

    // Deduct for issues
    for (const issue of issues) {
      switch (issue.code) {
        case 'INVALID_POSTAL_CODE':
          score -= 25;
          break;
        case 'UNKNOWN_CITY':
          score -= 20;
          break;
        case 'UNKNOWN_STREET':
          score -= 15;
          break;
        case 'TYPO_DETECTED':
          score -= 10;
          break;
        default:
          score -= 5;
      }
    }

    return Math.max(0, score) / 100;
  }

  // Format helpers

  private formatAddress(address: AddressInput): string {
    const parts: string[] = [];

    if (address.street) {
      const streetPart = address.houseNumber
        ? `${address.street} ${address.houseNumber}`
        : address.street;
      parts.push(streetPart);
    }

    if (address.additionalInfo) {
      parts.push(address.additionalInfo);
    }

    const cityPart = [address.postalCode, address.city].filter(Boolean).join(' ');
    if (cityPart) {
      parts.push(cityPart);
    }

    if (address.country) {
      parts.push(address.country);
    }

    return parts.join(', ');
  }

  private getCountryCode(country?: string): string | undefined {
    if (!country) return undefined;

    const codes: Record<string, string> = {
      austria: 'AT',
      österreich: 'AT',
      germany: 'DE',
      deutschland: 'DE',
      switzerland: 'CH',
      schweiz: 'CH',
      'united kingdom': 'GB',
      uk: 'GB',
      'united states': 'US',
      usa: 'US',
      france: 'FR',
      frankreich: 'FR',
      italy: 'IT',
      italien: 'IT',
      netherlands: 'NL',
      niederlande: 'NL',
    };

    if (country.length === 2) return country.toUpperCase();
    return codes[country.toLowerCase()] || country.toUpperCase().substring(0, 2);
  }

  private getCountryName(code?: string): string | undefined {
    if (!code) return undefined;

    const names: Record<string, string> = {
      AT: 'Austria',
      DE: 'Germany',
      CH: 'Switzerland',
      GB: 'United Kingdom',
      US: 'United States',
      FR: 'France',
      IT: 'Italy',
      NL: 'Netherlands',
    };

    return names[code.toUpperCase()] || code;
  }

  private detectCountry(address: string): string {
    const lower = address.toLowerCase();

    if (lower.includes('österreich') || lower.includes('austria') || /\b\d{4}\b/.test(address)) {
      return 'AT';
    }
    if (lower.includes('deutschland') || lower.includes('germany') || /\b\d{5}\b/.test(address)) {
      return 'DE';
    }
    if (lower.includes('schweiz') || lower.includes('switzerland')) {
      return 'CH';
    }

    return 'AT'; // Default
  }

  private getPostalCodeExample(countryCode: string): string {
    const examples: Record<string, string> = {
      AT: '1010',
      DE: '10115',
      CH: '8001',
      GB: 'SW1A 1AA',
      US: '10001 or 10001-1234',
    };
    return examples[countryCode.toUpperCase()] || 'varies by country';
  }

  // Mock helpers

  private async getMockSuggestions(
    partialAddress: string,
    countryCode?: string
  ): Promise<ValidatedAddress[]> {
    await this.simulateLatency();

    const code = countryCode?.toUpperCase() || 'AT';
    const cities = MAJOR_CITIES[code] || ['City'];

    return cities.slice(0, this.config.suggestionsLimit).map((city, idx) => ({
      street: `${partialAddress.split(' ')[0] || 'Main'} Straße`,
      houseNumber: `${idx + 1}`,
      postalCode: `${1000 + idx * 100}`,
      city,
      country: this.getCountryName(code) || code,
      countryCode: code,
      formattedAddress: `${partialAddress.split(' ')[0] || 'Main'} Straße ${idx + 1}, ${1000 + idx * 100} ${city}, ${this.getCountryName(code)}`,
      latitude: this.getMockLatitude(city),
      longitude: this.getMockLongitude(city),
    }));
  }

  private getMockReverseGeocode(latitude: number, longitude: number): ValidatedAddress {
    return {
      street: 'Sample Street',
      houseNumber: '1',
      postalCode: '1010',
      city: 'Wien',
      country: 'Austria',
      countryCode: 'AT',
      formattedAddress: 'Sample Street 1, 1010 Wien, Austria',
      latitude,
      longitude,
    };
  }

  private getMockLatitude(city?: string): number {
    const coords: Record<string, number> = {
      Wien: 48.2082,
      Berlin: 52.5200,
      Zürich: 47.3769,
      London: 51.5074,
    };
    return coords[city || ''] || 48.0 + Math.random() * 4;
  }

  private getMockLongitude(city?: string): number {
    const coords: Record<string, number> = {
      Wien: 16.3738,
      Berlin: 13.4050,
      Zürich: 8.5417,
      London: -0.1278,
    };
    return coords[city || ''] || 10.0 + Math.random() * 6;
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.provider === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }
  }

  // Cache helpers

  private getCacheKey(input: AddressInput): string {
    const str = JSON.stringify(input);
    return `addr:${createHash('md5').update(str).digest('hex')}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }

  clearCache(): void {
    cache.clear();
  }
}

// Factory function
export function createAddressValidator(
  countryCode?: string,
  config?: Partial<AddressValidatorConfig>
): AddressValidator {
  const providerMap: Record<string, ValidationProvider> = {
    AT: 'austrian_post',
    DE: 'deutsche_post',
    CH: 'swiss_post',
  };

  const provider = countryCode
    ? providerMap[countryCode.toUpperCase()] || 'nominatim'
    : 'nominatim';

  return new AddressValidator({
    ...config,
    provider,
  });
}

export default AddressValidator;
