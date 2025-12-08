/**
 * BMD NTCS Parser (T146)
 * Parse BMD NTCS (Native Transfer Control System) format
 * NTCS is BMD's proprietary data exchange format for accounting data
 */

/**
 * NTCS Record Type identifiers
 */
export enum NtcsRecordType {
  HEADER = 'HD',
  ACCOUNT = 'KO',
  BOOKING = 'BU',
  BUSINESS_PARTNER = 'GP',
  COST_CENTER = 'KS',
  FOOTER = 'FT',
}

/**
 * NTCS Record - Base interface for all NTCS records
 */
export interface NtcsRecord {
  recordType: NtcsRecordType;
  rawData: string;
  lineNumber: number;
}

/**
 * NTCS Header Record
 */
export interface NtcsHeader extends NtcsRecord {
  recordType: NtcsRecordType.HEADER;
  version: string;
  creationDate: string;
  creationTime: string;
  companyId: string;
  companyName: string;
  fiscalYear: number;
}

/**
 * NTCS Account Record (Chart of Accounts)
 */
export interface NtcsAccount extends NtcsRecord {
  recordType: NtcsRecordType.ACCOUNT;
  accountNumber: string;
  accountName: string;
  accountClass: string; // 'A' = Asset, 'L' = Liability, 'E' = Equity, 'R' = Revenue, 'X' = Expense
  accountType: string;
  balance: number;
  currency: string;
  isActive: boolean;
  parentAccountNumber?: string;
  taxCode?: string;
}

/**
 * NTCS Booking Record (Journal Entry)
 */
export interface NtcsBooking extends NtcsRecord {
  recordType: NtcsRecordType.BOOKING;
  bookingNumber: string;
  documentNumber: string;
  bookingDate: string; // DD.MM.YYYY format
  postingDate: string; // DD.MM.YYYY format
  accountNumber: string;
  contraAccountNumber: string;
  debitAmount: number;
  creditAmount: number;
  amount: number;
  currency: string;
  description: string;
  taxCode?: string;
  taxAmount?: number;
  costCenter?: string;
  costObject?: string;
  partnerId?: string;
  documentType?: string;
  dueDate?: string;
}

/**
 * NTCS Business Partner Record
 */
export interface NtcsBusinessPartner extends NtcsRecord {
  recordType: NtcsRecordType.BUSINESS_PARTNER;
  partnerId: string;
  partnerNumber: string;
  name: string;
  shortName?: string;
  partnerType: 'K' | 'L' | 'B'; // K = Kunde (Customer), L = Lieferant (Vendor), B = Both
  steuernummer?: string; // Austrian tax number
  uidNummer?: string; // UID-Nummer (VAT ID)
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  accountNumber?: string;
  paymentTermsDays?: number;
  creditLimit?: number;
  isActive: boolean;
}

/**
 * NTCS Cost Center Record
 */
export interface NtcsCostCenter extends NtcsRecord {
  recordType: NtcsRecordType.COST_CENTER;
  costCenterId: string;
  costCenterNumber: string;
  name: string;
  description?: string;
  isActive: boolean;
  parentCostCenterId?: string;
}

/**
 * NTCS Footer Record
 */
export interface NtcsFooter extends NtcsRecord {
  recordType: NtcsRecordType.FOOTER;
  totalRecords: number;
  totalBookings: number;
  totalAmount: number;
  checksum?: string;
}

/**
 * Parse result containing all parsed NTCS records
 */
export interface NtcsParseResult {
  header?: NtcsHeader;
  accounts: NtcsAccount[];
  bookings: NtcsBooking[];
  businessPartners: NtcsBusinessPartner[];
  costCenters: NtcsCostCenter[];
  footer?: NtcsFooter;
  errors: string[];
  warnings: string[];
}

/**
 * NTCS Parser Options
 */
export interface NtcsParserOptions {
  encoding?: BufferEncoding;
  strictMode?: boolean; // If true, fail on any parsing error
  skipInvalidRecords?: boolean; // If true, skip invalid records instead of failing
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
 * Split NTCS record line into fields
 * NTCS uses semicolon as field separator
 */
function splitNtcsLine(line: string): string[] {
  return line.split(';').map((field) => field.trim());
}

/**
 * Parse NTCS Header Record
 */
function parseHeader(fields: string[], lineNumber: number, rawData: string): NtcsHeader {
  if (fields.length < 7) {
    throw new Error(`Invalid header record at line ${lineNumber}: insufficient fields`);
  }

  return {
    recordType: NtcsRecordType.HEADER,
    version: fields[1],
    creationDate: fields[2],
    creationTime: fields[3],
    companyId: fields[4],
    companyName: fields[5],
    fiscalYear: parseInt(fields[6], 10),
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS Account Record
 */
function parseAccount(fields: string[], lineNumber: number, rawData: string): NtcsAccount {
  if (fields.length < 8) {
    throw new Error(`Invalid account record at line ${lineNumber}: insufficient fields`);
  }

  return {
    recordType: NtcsRecordType.ACCOUNT,
    accountNumber: fields[1],
    accountName: fields[2],
    accountClass: fields[3],
    accountType: fields[4],
    balance: parseGermanNumber(fields[5]),
    currency: fields[6] || 'EUR',
    isActive: fields[7] === '1' || fields[7].toLowerCase() === 'true',
    parentAccountNumber: fields[8] || undefined,
    taxCode: fields[9] || undefined,
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS Booking Record
 */
function parseBooking(fields: string[], lineNumber: number, rawData: string): NtcsBooking {
  if (fields.length < 10) {
    throw new Error(`Invalid booking record at line ${lineNumber}: insufficient fields`);
  }

  const debitAmount = parseGermanNumber(fields[6]);
  const creditAmount = parseGermanNumber(fields[7]);
  const amount = debitAmount - creditAmount;

  return {
    recordType: NtcsRecordType.BOOKING,
    bookingNumber: fields[1],
    documentNumber: fields[2],
    bookingDate: parseAustrianDate(fields[3]),
    postingDate: parseAustrianDate(fields[4]),
    accountNumber: fields[5],
    contraAccountNumber: fields[8],
    debitAmount,
    creditAmount,
    amount,
    currency: fields[9] || 'EUR',
    description: fields[10] || '',
    taxCode: fields[11] || undefined,
    taxAmount: fields[12] ? parseGermanNumber(fields[12]) : undefined,
    costCenter: fields[13] || undefined,
    costObject: fields[14] || undefined,
    partnerId: fields[15] || undefined,
    documentType: fields[16] || undefined,
    dueDate: fields[17] ? parseAustrianDate(fields[17]) : undefined,
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS Business Partner Record
 */
function parseBusinessPartner(
  fields: string[],
  lineNumber: number,
  rawData: string
): NtcsBusinessPartner {
  if (fields.length < 6) {
    throw new Error(`Invalid business partner record at line ${lineNumber}: insufficient fields`);
  }

  return {
    recordType: NtcsRecordType.BUSINESS_PARTNER,
    partnerId: fields[1],
    partnerNumber: fields[2],
    name: fields[3],
    shortName: fields[4] || undefined,
    partnerType: (fields[5] as 'K' | 'L' | 'B') || 'B',
    steuernummer: fields[6] || undefined,
    uidNummer: fields[7] || undefined,
    email: fields[8] || undefined,
    phone: fields[9] || undefined,
    fax: fields[10] || undefined,
    website: fields[11] || undefined,
    street: fields[12] || undefined,
    city: fields[13] || undefined,
    postalCode: fields[14] || undefined,
    country: fields[15] || 'AT',
    accountNumber: fields[16] || undefined,
    paymentTermsDays: fields[17] ? parseInt(fields[17], 10) : undefined,
    creditLimit: fields[18] ? parseGermanNumber(fields[18]) : undefined,
    isActive: fields[19] === '1' || fields[19]?.toLowerCase() === 'true',
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS Cost Center Record
 */
function parseCostCenter(fields: string[], lineNumber: number, rawData: string): NtcsCostCenter {
  if (fields.length < 4) {
    throw new Error(`Invalid cost center record at line ${lineNumber}: insufficient fields`);
  }

  return {
    recordType: NtcsRecordType.COST_CENTER,
    costCenterId: fields[1],
    costCenterNumber: fields[2],
    name: fields[3],
    description: fields[4] || undefined,
    isActive: fields[5] === '1' || fields[5]?.toLowerCase() === 'true',
    parentCostCenterId: fields[6] || undefined,
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS Footer Record
 */
function parseFooter(fields: string[], lineNumber: number, rawData: string): NtcsFooter {
  if (fields.length < 4) {
    throw new Error(`Invalid footer record at line ${lineNumber}: insufficient fields`);
  }

  return {
    recordType: NtcsRecordType.FOOTER,
    totalRecords: parseInt(fields[1], 10),
    totalBookings: parseInt(fields[2], 10),
    totalAmount: parseGermanNumber(fields[3]),
    checksum: fields[4] || undefined,
    rawData,
    lineNumber,
  };
}

/**
 * Parse NTCS file content
 */
export function parseNtcsFile(
  content: string,
  options: NtcsParserOptions = {}
): NtcsParseResult {
  const result: NtcsParseResult = {
    accounts: [],
    bookings: [],
    businessPartners: [],
    costCenters: [],
    errors: [],
    warnings: [],
  };

  const lines = content.split(/\r?\n/);
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Skip comment lines (starting with #)
    if (line.trim().startsWith('#')) {
      continue;
    }

    try {
      const fields = splitNtcsLine(line);
      const recordType = fields[0] as NtcsRecordType;

      switch (recordType) {
        case NtcsRecordType.HEADER:
          result.header = parseHeader(fields, lineNumber, line);
          break;

        case NtcsRecordType.ACCOUNT:
          result.accounts.push(parseAccount(fields, lineNumber, line));
          break;

        case NtcsRecordType.BOOKING:
          result.bookings.push(parseBooking(fields, lineNumber, line));
          break;

        case NtcsRecordType.BUSINESS_PARTNER:
          result.businessPartners.push(parseBusinessPartner(fields, lineNumber, line));
          break;

        case NtcsRecordType.COST_CENTER:
          result.costCenters.push(parseCostCenter(fields, lineNumber, line));
          break;

        case NtcsRecordType.FOOTER:
          result.footer = parseFooter(fields, lineNumber, line);
          break;

        default:
          const warning = `Unknown record type '${recordType}' at line ${lineNumber}`;
          result.warnings.push(warning);

          if (options.strictMode && !options.skipInvalidRecords) {
            result.errors.push(warning);
          }
          break;
      }
    } catch (error) {
      const errorMsg = `Error parsing line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);

      if (options.strictMode && !options.skipInvalidRecords) {
        throw new Error(errorMsg);
      }
    }
  }

  // Validate footer if present
  if (result.footer) {
    const actualRecords =
      result.accounts.length +
      result.bookings.length +
      result.businessPartners.length +
      result.costCenters.length;

    if (result.footer.totalRecords !== actualRecords) {
      const warning = `Footer record count mismatch: expected ${result.footer.totalRecords}, got ${actualRecords}`;
      result.warnings.push(warning);
    }

    if (result.footer.totalBookings !== result.bookings.length) {
      const warning = `Footer booking count mismatch: expected ${result.footer.totalBookings}, got ${result.bookings.length}`;
      result.warnings.push(warning);
    }
  }

  return result;
}

/**
 * Parse NTCS file from buffer
 */
export function parseNtcsBuffer(
  buffer: Buffer,
  options: NtcsParserOptions = {}
): NtcsParseResult {
  const encoding = options.encoding || 'utf-8';
  const content = buffer.toString(encoding);
  return parseNtcsFile(content, options);
}

/**
 * Validate NTCS file structure
 */
export function validateNtcsFile(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    errors.push('File is empty');
    return { valid: false, errors };
  }

  // Check for header
  const firstLine = lines[0].trim();
  if (!firstLine.startsWith('HD;')) {
    errors.push('File must start with a header record (HD)');
  }

  // Check for valid record types
  const validRecordTypes = Object.values(NtcsRecordType);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) continue;

    const recordType = line.split(';')[0];
    if (!validRecordTypes.includes(recordType as NtcsRecordType)) {
      errors.push(`Invalid record type '${recordType}' at line ${i + 1}`);
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
export type {
  NtcsParserOptions,
  NtcsParseResult,
};
