/**
 * Data Quality Scorer
 * Calculates quality scores for entity records based on completeness, validity, and consistency
 */

import { EntityType } from './entityRecordService.js';

export interface QualityScore {
  overall: number;
  completeness: number;
  validity: number;
  consistency: number;
  accuracy: number;
  details: QualityDetail[];
}

export interface QualityDetail {
  field: string;
  score: number;
  issues: string[];
  weight: number;
}

export interface QualityRules {
  requiredFields: string[];
  optionalFields: string[];
  validators: Record<string, FieldValidator>;
  weights: Record<string, number>;
}

export interface FieldValidator {
  validate: (value: unknown) => ValidationResult;
  name: string;
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  issues: string[];
}

/**
 * Standard quality rules for each entity type
 */
const QUALITY_RULES: Record<EntityType, QualityRules> = {
  person: {
    requiredFields: ['firstName', 'lastName'],
    optionalFields: ['email', 'phone', 'dateOfBirth', 'address', 'jobTitle', 'department'],
    validators: {
      firstName: {
        name: 'firstName',
        validate: (value) => validateName(value, 'First name'),
      },
      lastName: {
        name: 'lastName',
        validate: (value) => validateName(value, 'Last name'),
      },
      email: {
        name: 'email',
        validate: validateEmail,
      },
      phone: {
        name: 'phone',
        validate: validatePhone,
      },
      dateOfBirth: {
        name: 'dateOfBirth',
        validate: validateDate,
      },
    },
    weights: {
      firstName: 1.5,
      lastName: 2,
      email: 2,
      phone: 1,
      dateOfBirth: 0.5,
      address: 1,
      jobTitle: 0.5,
      department: 0.5,
    },
  },

  company: {
    requiredFields: ['name'],
    optionalFields: ['vatId', 'registrationNumber', 'email', 'phone', 'address', 'website', 'industry'],
    validators: {
      name: {
        name: 'name',
        validate: (value) => validateCompanyName(value),
      },
      vatId: {
        name: 'vatId',
        validate: validateVatId,
      },
      email: {
        name: 'email',
        validate: validateEmail,
      },
      phone: {
        name: 'phone',
        validate: validatePhone,
      },
      website: {
        name: 'website',
        validate: validateUrl,
      },
    },
    weights: {
      name: 3,
      vatId: 2.5,
      registrationNumber: 2,
      email: 1.5,
      phone: 1,
      address: 1.5,
      website: 0.5,
      industry: 0.5,
    },
  },

  address: {
    requiredFields: ['street', 'postalCode', 'city'],
    optionalFields: ['houseNumber', 'addition', 'state', 'country'],
    validators: {
      street: {
        name: 'street',
        validate: (value) => validateNonEmpty(value, 'Street'),
      },
      postalCode: {
        name: 'postalCode',
        validate: validatePostalCode,
      },
      city: {
        name: 'city',
        validate: (value) => validateNonEmpty(value, 'City'),
      },
      country: {
        name: 'country',
        validate: validateCountry,
      },
    },
    weights: {
      street: 2,
      houseNumber: 1,
      postalCode: 2,
      city: 2,
      state: 0.5,
      country: 1,
    },
  },

  product: {
    requiredFields: ['name'],
    optionalFields: ['sku', 'ean', 'description', 'category', 'manufacturer', 'price'],
    validators: {
      name: {
        name: 'name',
        validate: (value) => validateNonEmpty(value, 'Product name'),
      },
      sku: {
        name: 'sku',
        validate: validateSku,
      },
      ean: {
        name: 'ean',
        validate: validateEan,
      },
      price: {
        name: 'price',
        validate: validatePrice,
      },
    },
    weights: {
      name: 2,
      sku: 3,
      ean: 3,
      description: 0.5,
      category: 1,
      manufacturer: 1,
      price: 1.5,
    },
  },

  contact: {
    requiredFields: ['name'],
    optionalFields: ['email', 'phone', 'company', 'position', 'notes'],
    validators: {
      name: {
        name: 'name',
        validate: (value) => validateNonEmpty(value, 'Name'),
      },
      email: {
        name: 'email',
        validate: validateEmail,
      },
      phone: {
        name: 'phone',
        validate: validatePhone,
      },
    },
    weights: {
      name: 2,
      email: 2,
      phone: 1.5,
      company: 1,
      position: 0.5,
      notes: 0.25,
    },
  },
};

/**
 * Calculate quality score for entity data
 */
export function calculateQualityScore(
  entityType: EntityType,
  data: Record<string, unknown>
): number {
  const score = calculateDetailedQualityScore(entityType, data);
  return score.overall;
}

/**
 * Calculate detailed quality score with breakdown
 */
export function calculateDetailedQualityScore(
  entityType: EntityType,
  data: Record<string, unknown>
): QualityScore {
  const rules = QUALITY_RULES[entityType];
  const details: QualityDetail[] = [];

  let totalWeight = 0;
  let weightedScore = 0;

  // Check completeness of required fields
  let requiredPresent = 0;
  for (const field of rules.requiredFields) {
    const value = getNestedValue(data, field);
    const weight = rules.weights[field] || 1;
    totalWeight += weight;

    if (hasValue(value)) {
      requiredPresent++;
      const validator = rules.validators[field];
      if (validator) {
        const result = validator.validate(value);
        weightedScore += result.score * weight;
        details.push({
          field,
          score: result.score,
          issues: result.issues,
          weight,
        });
      } else {
        weightedScore += weight;
        details.push({
          field,
          score: 1,
          issues: [],
          weight,
        });
      }
    } else {
      details.push({
        field,
        score: 0,
        issues: [`Required field "${field}" is missing`],
        weight,
      });
    }
  }

  // Check optional fields (contribute to score if present and valid)
  let optionalPresent = 0;
  for (const field of rules.optionalFields) {
    const value = getNestedValue(data, field);
    const weight = rules.weights[field] || 0.5;
    totalWeight += weight;

    if (hasValue(value)) {
      optionalPresent++;
      const validator = rules.validators[field];
      if (validator) {
        const result = validator.validate(value);
        weightedScore += result.score * weight;
        details.push({
          field,
          score: result.score,
          issues: result.issues,
          weight,
        });
      } else {
        weightedScore += weight;
        details.push({
          field,
          score: 1,
          issues: [],
          weight,
        });
      }
    } else {
      // Optional fields get partial credit for being absent
      weightedScore += weight * 0.5;
      details.push({
        field,
        score: 0.5,
        issues: [],
        weight,
      });
    }
  }

  // Calculate component scores
  const completeness =
    rules.requiredFields.length > 0
      ? requiredPresent / rules.requiredFields.length
      : 1;

  const optionalCompleteness =
    rules.optionalFields.length > 0
      ? optionalPresent / rules.optionalFields.length
      : 1;

  const validity = details.length > 0
    ? details.reduce((sum, d) => sum + d.score, 0) / details.length
    : 1;

  const overall = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;

  return {
    overall: Math.round(overall * 100) / 100,
    completeness: Math.round(completeness * 100) / 100,
    validity: Math.round(validity * 100) / 100,
    consistency: 1, // Would require cross-record analysis
    accuracy: validity, // Approximation
    details,
  };
}

/**
 * Get nested value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = obj;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Check if value is present and non-empty
 */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

// Validation functions

function validateNonEmpty(value: unknown, fieldName: string): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: [`${fieldName} is empty`] };
  }
  const str = String(value).trim();
  if (str.length < 2) {
    return { valid: false, score: 0.5, issues: [`${fieldName} is too short`] };
  }
  return { valid: true, score: 1, issues: [] };
}

function validateName(value: unknown, fieldName: string): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: [`${fieldName} is missing`] };
  }

  const str = String(value).trim();
  const issues: string[] = [];

  if (str.length < 2) {
    issues.push(`${fieldName} is too short`);
    return { valid: false, score: 0.3, issues };
  }

  // Check for suspicious patterns
  if (/^\d+$/.test(str)) {
    issues.push(`${fieldName} contains only numbers`);
    return { valid: false, score: 0.2, issues };
  }

  if (/^[^a-zA-ZäöüÄÖÜß]+$/.test(str)) {
    issues.push(`${fieldName} contains no letters`);
    return { valid: false, score: 0.3, issues };
  }

  // Check capitalization
  if (str === str.toLowerCase()) {
    issues.push(`${fieldName} is not capitalized`);
    return { valid: true, score: 0.8, issues };
  }

  return { valid: true, score: 1, issues: [] };
}

function validateEmail(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Email is missing'] };
  }

  const str = String(value).trim().toLowerCase();
  const issues: string[] = [];

  // Basic email pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(str)) {
    issues.push('Invalid email format');
    return { valid: false, score: 0.3, issues };
  }

  // Check for common typos
  if (/\.(con|cmo|ocm|xom)$/i.test(str)) {
    issues.push('Possible typo in email domain');
    return { valid: true, score: 0.7, issues };
  }

  // Check for placeholder emails
  if (/^(test|dummy|fake|example|sample)@/i.test(str)) {
    issues.push('Looks like a placeholder email');
    return { valid: true, score: 0.5, issues };
  }

  return { valid: true, score: 1, issues: [] };
}

function validatePhone(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Phone is missing'] };
  }

  const str = String(value).replace(/\s/g, '');
  const digits = str.replace(/\D/g, '');
  const issues: string[] = [];

  if (digits.length < 6) {
    issues.push('Phone number too short');
    return { valid: false, score: 0.3, issues };
  }

  if (digits.length > 15) {
    issues.push('Phone number too long');
    return { valid: false, score: 0.5, issues };
  }

  // Check for German/Austrian/Swiss formats
  if (/^(\+?49|0049|0)/.test(str) || /^(\+?43|0043)/.test(str) || /^(\+?41|0041)/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  // Generic valid format
  if (/^\+?\d{6,15}$/.test(digits)) {
    return { valid: true, score: 0.9, issues: [] };
  }

  issues.push('Unusual phone format');
  return { valid: true, score: 0.7, issues };
}

function validateDate(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Date is missing'] };
  }

  const date = new Date(String(value));
  const issues: string[] = [];

  if (isNaN(date.getTime())) {
    issues.push('Invalid date format');
    return { valid: false, score: 0, issues };
  }

  const now = new Date();
  const year = date.getFullYear();

  // Check reasonable date range (for birth dates)
  if (year < 1900) {
    issues.push('Date is too old');
    return { valid: false, score: 0.3, issues };
  }

  if (date > now) {
    issues.push('Date is in the future');
    return { valid: false, score: 0.5, issues };
  }

  return { valid: true, score: 1, issues: [] };
}

function validateCompanyName(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Company name is missing'] };
  }

  const str = String(value).trim();
  const issues: string[] = [];

  if (str.length < 2) {
    issues.push('Company name is too short');
    return { valid: false, score: 0.3, issues };
  }

  // Check for legal form
  const legalFormPattern = /\b(gmbh|ag|kg|ohg|ug|gbr|e\.?v\.?|e\.?k\.?|se|sa|s[àa]rl)\b/i;
  if (!legalFormPattern.test(str)) {
    issues.push('No legal form detected');
    return { valid: true, score: 0.8, issues };
  }

  return { valid: true, score: 1, issues: [] };
}

function validateVatId(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['VAT ID is missing'] };
  }

  const str = String(value).replace(/\s/g, '').toUpperCase();
  const issues: string[] = [];

  // German VAT ID
  if (/^DE\d{9}$/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  // Austrian VAT ID
  if (/^ATU\d{8}$/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  // Swiss VAT ID
  if (/^CHE\d{9}(MWST)?$/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  issues.push('Invalid VAT ID format');
  return { valid: false, score: 0.3, issues };
}

function validatePostalCode(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Postal code is missing'] };
  }

  const str = String(value).replace(/\s/g, '');

  // German (5 digits)
  if (/^\d{5}$/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  // Austrian/Swiss (4 digits)
  if (/^\d{4}$/.test(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  return { valid: false, score: 0.5, issues: ['Invalid postal code format'] };
}

function validateCountry(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: true, score: 0.5, issues: [] }; // Optional
  }

  const str = String(value).toLowerCase().trim();
  const validCountries = [
    'deutschland', 'germany', 'de', 'd',
    'österreich', 'oesterreich', 'austria', 'at', 'a',
    'schweiz', 'switzerland', 'suisse', 'ch',
  ];

  if (validCountries.includes(str)) {
    return { valid: true, score: 1, issues: [] };
  }

  return { valid: true, score: 0.8, issues: ['Unknown country'] };
}

function validateUrl(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['URL is missing'] };
  }

  const str = String(value).trim();

  try {
    new URL(str.startsWith('http') ? str : `https://${str}`);
    return { valid: true, score: 1, issues: [] };
  } catch {
    return { valid: false, score: 0.3, issues: ['Invalid URL format'] };
  }
}

function validateSku(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['SKU is missing'] };
  }

  const str = String(value).trim();

  if (str.length < 3) {
    return { valid: false, score: 0.5, issues: ['SKU is too short'] };
  }

  return { valid: true, score: 1, issues: [] };
}

function validateEan(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['EAN is missing'] };
  }

  const str = String(value).replace(/\D/g, '');

  if (str.length !== 13 && str.length !== 8) {
    return { valid: false, score: 0.3, issues: ['Invalid EAN length'] };
  }

  // Validate checksum
  const digits = str.split('').map(Number);
  let sum = 0;

  for (let i = 0; i < digits.length - 1; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  if (checkDigit !== digits[digits.length - 1]) {
    return { valid: false, score: 0.5, issues: ['Invalid EAN checksum'] };
  }

  return { valid: true, score: 1, issues: [] };
}

function validatePrice(value: unknown): ValidationResult {
  if (!hasValue(value)) {
    return { valid: false, score: 0, issues: ['Price is missing'] };
  }

  const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));

  if (isNaN(num)) {
    return { valid: false, score: 0, issues: ['Invalid price format'] };
  }

  if (num < 0) {
    return { valid: false, score: 0.3, issues: ['Price is negative'] };
  }

  return { valid: true, score: 1, issues: [] };
}

export default {
  calculateQualityScore,
  calculateDetailedQualityScore,
  QUALITY_RULES,
};
