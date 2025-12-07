/**
 * Normalizers Module Index
 * Exports DACH region normalizers
 */

export {
  normalizeAddress,
  normalizeStreet,
  normalizeCity,
  normalizePostalCode,
  validatePostalCode,
  GERMAN_STATES,
  AUSTRIAN_STATES,
  SWISS_CANTONS,
  type Address,
  type NormalizedAddress,
} from './addressNormalizer.js';

export {
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
  type CompanyName,
  type NormalizedCompany,
} from './companyNormalizer.js';
