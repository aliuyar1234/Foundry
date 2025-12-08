/**
 * BMD CSV Parser (T147)
 * Parse BMD CSV export formats
 * BMD supports various CSV export formats for different data types
 */

/**
 * CSV Export Type identifiers
 */
export enum BmdCsvExportType {
  BOOKINGS = 'Buchungsexport',
  ACCOUNTS = 'Kontenexport',
  MASTER_DATA = 'Stammdatenexport',
  BUSINESS_PARTNERS = 'Geschaeftspartner',
  COST_CENTERS = 'Kostenstellen',
}

/**
 * CSV Booking Record (from Buchungsexport)
 */
export interface CsvBookingRecord {
  belegnummer: string; // Document number
  buchungsnummer: string; // Booking number
  belegdatum: string; // Document date (DD.MM.YYYY)
  buchungsdatum: string; // Posting date (DD.MM.YYYY)
  konto: string; // Account number
  gegenkonto: string; // Contra account number
  sollbetrag: number; // Debit amount
  habenbetrag: number; // Credit amount
  betrag: number; // Amount
  waehrung: string; // Currency
  text: string; // Description
  steuerschluessel?: string; // Tax code
  steuerbetrag?: number; // Tax amount
  kostenstelle?: string; // Cost center
  kostentraeger?: string; // Cost object
  geschaeftspartner?: string; // Business partner ID
  belegart?: string; // Document type
  faelligkeitsdatum?: string; // Due date (DD.MM.YYYY)
}

/**
 * CSV Account Record (from Kontenexport)
 */
export interface CsvAccountRecord {
  kontonummer: string; // Account number
  kontobezeichnung: string; // Account name
  kontenklasse: string; // Account class
  kontoart: string; // Account type
  saldo: number; // Balance
  waehrung: string; // Currency
  aktiv: boolean; // Is active
  uebergeordnetesKonto?: string; // Parent account number
  steuerschluessel?: string; // Tax code
}

/**
 * CSV Business Partner Record (from Geschaeftspartner)
 */
export interface CsvBusinessPartnerRecord {
  partnerId: string; // Partner ID
  partnerNummer: string; // Partner number
  name: string; // Name
  kurzbezeichnung?: string; // Short name
  typ: 'K' | 'L' | 'B'; // Type: K=Customer, L=Vendor, B=Both
  steuernummer?: string; // Tax number (Steuernummer)
  uidNummer?: string; // VAT ID (UID-Nummer)
  email?: string; // Email
  telefon?: string; // Phone
  fax?: string; // Fax
  webseite?: string; // Website
  strasse?: string; // Street
  ort?: string; // City
  plz?: string; // Postal code
  land?: string; // Country
  kontonummer?: string; // Account number
  zahlungsziel?: number; // Payment terms (days)
  kreditlimit?: number; // Credit limit
  aktiv: boolean; // Is active
}

/**
 * CSV Cost Center Record (from Kostenstellen)
 */
export interface CsvCostCenterRecord {
  kostenstellenId: string; // Cost center ID
  kostenstellenNummer: string; // Cost center number
  bezeichnung: string; // Name
  beschreibung?: string; // Description
  aktiv: boolean; // Is active
  uebergeordneteKostenstelle?: string; // Parent cost center ID
}

/**
 * CSV Parse Result
 */
export interface CsvParseResult<T> {
  records: T[];
  headers: string[];
  exportType?: BmdCsvExportType;
  errors: string[];
  warnings: string[];
}

/**
 * CSV Parser Options
 */
export interface CsvParserOptions {
  delimiter?: string; // Default: semicolon (;)
  encoding?: BufferEncoding;
  hasHeader?: boolean; // Default: true
  strictMode?: boolean;
  skipEmptyLines?: boolean; // Default: true
  trimFields?: boolean; // Default: true
}

/**
 * Parse Austrian date format (DD.MM.YYYY) to ISO string
 */
function parseAustrianDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') {
    return '';
  }

  const parts = dateStr.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid Austrian date format: ${dateStr}`);
  }

  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse German number format (comma as decimal separator)
 */
function parseGermanNumber(numStr: string): number {
  if (!numStr || numStr.trim() === '') {
    return 0;
  }

  // Remove thousand separators (dot or space) and replace comma with dot
  const normalized = numStr
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const num = parseFloat(normalized);
  if (isNaN(num)) {
    throw new Error(`Invalid number format: ${numStr}`);
  }

  return num;
}

/**
 * Parse boolean value (German format)
 */
function parseGermanBoolean(value: string): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase().trim();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'ja' ||
    normalized === 'yes' ||
    normalized === 'wahr'
  );
}

/**
 * Split CSV line respecting quoted fields
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Add the last field
  fields.push(currentField);

  return fields;
}

/**
 * Detect CSV export type from headers
 */
export function detectCsvExportType(headers: string[]): BmdCsvExportType | undefined {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  // Check for Buchungsexport (Bookings)
  if (
    normalizedHeaders.includes('belegnummer') &&
    normalizedHeaders.includes('buchungsnummer') &&
    normalizedHeaders.includes('konto')
  ) {
    return BmdCsvExportType.BOOKINGS;
  }

  // Check for Kontenexport (Accounts)
  if (
    normalizedHeaders.includes('kontonummer') &&
    normalizedHeaders.includes('kontobezeichnung') &&
    normalizedHeaders.includes('kontenklasse')
  ) {
    return BmdCsvExportType.ACCOUNTS;
  }

  // Check for Geschaeftspartner (Business Partners)
  if (
    normalizedHeaders.includes('partnerid') &&
    normalizedHeaders.includes('name') &&
    normalizedHeaders.includes('typ')
  ) {
    return BmdCsvExportType.BUSINESS_PARTNERS;
  }

  // Check for Kostenstellen (Cost Centers)
  if (
    normalizedHeaders.includes('kostenstellenid') &&
    normalizedHeaders.includes('bezeichnung')
  ) {
    return BmdCsvExportType.COST_CENTERS;
  }

  return undefined;
}

/**
 * Parse CSV booking record
 */
function parseBookingRecord(
  fields: string[],
  headers: string[],
  lineNumber: number
): CsvBookingRecord {
  const record: Record<string, string> = {};

  for (let i = 0; i < headers.length && i < fields.length; i++) {
    const header = headers[i].toLowerCase().trim();
    record[header] = fields[i];
  }

  try {
    return {
      belegnummer: record['belegnummer'] || '',
      buchungsnummer: record['buchungsnummer'] || '',
      belegdatum: parseAustrianDate(record['belegdatum'] || ''),
      buchungsdatum: parseAustrianDate(record['buchungsdatum'] || ''),
      konto: record['konto'] || '',
      gegenkonto: record['gegenkonto'] || '',
      sollbetrag: parseGermanNumber(record['sollbetrag'] || '0'),
      habenbetrag: parseGermanNumber(record['habenbetrag'] || '0'),
      betrag: parseGermanNumber(record['betrag'] || '0'),
      waehrung: record['waehrung'] || 'EUR',
      text: record['text'] || '',
      steuerschluessel: record['steuerschluessel'] || undefined,
      steuerbetrag: record['steuerbetrag']
        ? parseGermanNumber(record['steuerbetrag'])
        : undefined,
      kostenstelle: record['kostenstelle'] || undefined,
      kostentraeger: record['kostentraeger'] || undefined,
      geschaeftspartner: record['geschaeftspartner'] || undefined,
      belegart: record['belegart'] || undefined,
      faelligkeitsdatum: record['faelligkeitsdatum']
        ? parseAustrianDate(record['faelligkeitsdatum'])
        : undefined,
    };
  } catch (error) {
    throw new Error(
      `Error parsing booking record at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse CSV account record
 */
function parseAccountRecord(
  fields: string[],
  headers: string[],
  lineNumber: number
): CsvAccountRecord {
  const record: Record<string, string> = {};

  for (let i = 0; i < headers.length && i < fields.length; i++) {
    const header = headers[i].toLowerCase().trim();
    record[header] = fields[i];
  }

  try {
    return {
      kontonummer: record['kontonummer'] || '',
      kontobezeichnung: record['kontobezeichnung'] || '',
      kontenklasse: record['kontenklasse'] || '',
      kontoart: record['kontoart'] || '',
      saldo: parseGermanNumber(record['saldo'] || '0'),
      waehrung: record['waehrung'] || 'EUR',
      aktiv: parseGermanBoolean(record['aktiv'] || 'true'),
      uebergeordneteskonto: record['uebergeordneteskonto'] || undefined,
      steuerschluessel: record['steuerschluessel'] || undefined,
    };
  } catch (error) {
    throw new Error(
      `Error parsing account record at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse CSV business partner record
 */
function parseBusinessPartnerRecord(
  fields: string[],
  headers: string[],
  lineNumber: number
): CsvBusinessPartnerRecord {
  const record: Record<string, string> = {};

  for (let i = 0; i < headers.length && i < fields.length; i++) {
    const header = headers[i].toLowerCase().trim();
    record[header] = fields[i];
  }

  try {
    return {
      partnerId: record['partnerid'] || '',
      partnerNummer: record['partnernummer'] || '',
      name: record['name'] || '',
      kurzbezeichnung: record['kurzbezeichnung'] || undefined,
      typ: (record['typ'] as 'K' | 'L' | 'B') || 'B',
      steuernummer: record['steuernummer'] || undefined,
      uidNummer: record['uidnummer'] || undefined,
      email: record['email'] || undefined,
      telefon: record['telefon'] || undefined,
      fax: record['fax'] || undefined,
      webseite: record['webseite'] || undefined,
      strasse: record['strasse'] || undefined,
      ort: record['ort'] || undefined,
      plz: record['plz'] || undefined,
      land: record['land'] || 'AT',
      kontonummer: record['kontonummer'] || undefined,
      zahlungsziel: record['zahlungsziel'] ? parseInt(record['zahlungsziel'], 10) : undefined,
      kreditlimit: record['kreditlimit'] ? parseGermanNumber(record['kreditlimit']) : undefined,
      aktiv: parseGermanBoolean(record['aktiv'] || 'true'),
    };
  } catch (error) {
    throw new Error(
      `Error parsing business partner record at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse CSV cost center record
 */
function parseCostCenterRecord(
  fields: string[],
  headers: string[],
  lineNumber: number
): CsvCostCenterRecord {
  const record: Record<string, string> = {};

  for (let i = 0; i < headers.length && i < fields.length; i++) {
    const header = headers[i].toLowerCase().trim();
    record[header] = fields[i];
  }

  try {
    return {
      kostenstellenId: record['kostenstellenid'] || '',
      kostenstellenNummer: record['kostenstellennummer'] || '',
      bezeichnung: record['bezeichnung'] || '',
      beschreibung: record['beschreibung'] || undefined,
      aktiv: parseGermanBoolean(record['aktiv'] || 'true'),
      uebergeordnetekostenstelle: record['uebergeordnetekostenstelle'] || undefined,
    };
  } catch (error) {
    throw new Error(
      `Error parsing cost center record at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse BMD CSV file
 */
export function parseBmdCsvFile<T>(
  content: string,
  options: CsvParserOptions = {}
): CsvParseResult<T> {
  const delimiter = options.delimiter || ';';
  const hasHeader = options.hasHeader !== false;
  const skipEmptyLines = options.skipEmptyLines !== false;
  const trimFields = options.trimFields !== false;

  const result: CsvParseResult<T> = {
    records: [],
    headers: [],
    errors: [],
    warnings: [],
  };

  const lines = content.split(/\r?\n/);
  let lineNumber = 0;
  let headers: string[] = [];

  for (const rawLine of lines) {
    lineNumber++;

    // Skip empty lines
    if (skipEmptyLines && !rawLine.trim()) {
      continue;
    }

    try {
      let fields = splitCsvLine(rawLine, delimiter);

      // Trim fields if requested
      if (trimFields) {
        fields = fields.map((f) => f.trim());
      }

      // First line is header
      if (lineNumber === 1 && hasHeader) {
        headers = fields;
        result.headers = headers;
        result.exportType = detectCsvExportType(headers);
        continue;
      }

      // Skip empty rows
      if (fields.every((f) => !f.trim())) {
        continue;
      }

      // Parse based on detected export type
      let record: unknown;

      if (!result.exportType) {
        result.warnings.push('Could not detect CSV export type, skipping data parsing');
        break;
      }

      switch (result.exportType) {
        case BmdCsvExportType.BOOKINGS:
          record = parseBookingRecord(fields, headers, lineNumber);
          break;

        case BmdCsvExportType.ACCOUNTS:
          record = parseAccountRecord(fields, headers, lineNumber);
          break;

        case BmdCsvExportType.BUSINESS_PARTNERS:
          record = parseBusinessPartnerRecord(fields, headers, lineNumber);
          break;

        case BmdCsvExportType.COST_CENTERS:
          record = parseCostCenterRecord(fields, headers, lineNumber);
          break;

        default:
          result.warnings.push(`Unknown export type at line ${lineNumber}`);
          continue;
      }

      result.records.push(record as T);
    } catch (error) {
      const errorMsg = `Error parsing line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);

      if (options.strictMode) {
        throw new Error(errorMsg);
      }
    }
  }

  return result;
}

/**
 * Parse BMD CSV file from buffer
 */
export function parseBmdCsvBuffer<T>(
  buffer: Buffer,
  options: CsvParserOptions = {}
): CsvParseResult<T> {
  const encoding = options.encoding || 'utf-8';
  const content = buffer.toString(encoding);
  return parseBmdCsvFile<T>(content, options);
}

/**
 * Validate CSV file structure
 */
export function validateBmdCsvFile(
  content: string,
  options: CsvParserOptions = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const delimiter = options.delimiter || ';';

  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    errors.push('File is empty');
    return { valid: false, errors };
  }

  // Check first line for headers
  const firstLine = lines[0];
  const headers = splitCsvLine(firstLine, delimiter);

  if (headers.length === 0) {
    errors.push('No headers found');
    return { valid: false, errors };
  }

  // Detect export type
  const exportType = detectCsvExportType(headers);
  if (!exportType) {
    errors.push('Could not detect CSV export type from headers');
  }

  // Check for consistent column count
  const expectedColumns = headers.length;
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delimiter);
    if (fields.length !== expectedColumns && fields.some((f) => f.trim())) {
      errors.push(
        `Line ${i + 1} has ${fields.length} columns, expected ${expectedColumns}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export types
 */
export type { CsvParserOptions, CsvParseResult };
