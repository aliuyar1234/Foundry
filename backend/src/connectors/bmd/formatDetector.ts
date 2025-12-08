/**
 * BMD Format Detector (T148)
 * Auto-detect BMD file format and return appropriate parser
 */

import {
  NtcsRecordType,
  parseNtcsFile,
  parseNtcsBuffer,
  validateNtcsFile,
  type NtcsParseResult,
  type NtcsParserOptions,
} from './parsers/ntcsParser.js';
import {
  BmdCsvExportType,
  parseBmdCsvFile,
  parseBmdCsvBuffer,
  validateBmdCsvFile,
  detectCsvExportType,
  type CsvParseResult,
  type CsvParserOptions,
  type CsvBookingRecord,
  type CsvAccountRecord,
  type CsvBusinessPartnerRecord,
  type CsvCostCenterRecord,
} from './parsers/csvParser.js';

/**
 * Detected file format
 */
export enum BmdFileFormat {
  NTCS = 'NTCS',
  CSV = 'CSV',
  UNKNOWN = 'UNKNOWN',
}

/**
 * File detection result
 */
export interface FileDetectionResult {
  format: BmdFileFormat;
  confidence: number; // 0-1, higher is more confident
  csvExportType?: BmdCsvExportType;
  encoding?: BufferEncoding;
  delimiter?: string;
  metadata?: {
    lines: number;
    size: number;
    hasHeader?: boolean;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Parser factory result
 */
export interface ParserFactoryResult {
  format: BmdFileFormat;
  parser: BmdParser;
}

/**
 * Generic BMD Parser interface
 */
export interface BmdParser {
  parse(content: string): BmdParseResult;
  parseBuffer(buffer: Buffer): BmdParseResult;
  validate(content: string): { valid: boolean; errors: string[] };
}

/**
 * Unified parse result
 */
export type BmdParseResult = NtcsParseResult | CsvParseResult<unknown>;

/**
 * Detect encoding from BOM (Byte Order Mark)
 */
function detectEncoding(buffer: Buffer): BufferEncoding {
  // Check for UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }

  // Check for UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf16le';
  }

  // Check for UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf16le'; // Node.js doesn't have utf16be, use utf16le and handle manually if needed
  }

  // Default to UTF-8 (most common for BMD exports)
  return 'utf-8';
}

/**
 * Detect delimiter in CSV file
 */
function detectCsvDelimiter(content: string): string {
  const lines = content.split(/\r?\n/).slice(0, 5); // Check first 5 lines

  // Count occurrences of common delimiters
  const delimiters = [';', ',', '\t', '|'];
  const counts = delimiters.map((delimiter) => {
    const lineCounts = lines.map((line) => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);
    // Return average count and consistency (variance should be low)
    const avg = lineCounts.reduce((a, b) => a + b, 0) / lineCounts.length;
    const variance =
      lineCounts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / lineCounts.length;
    return { delimiter, avg, variance };
  });

  // Sort by average count (descending) and variance (ascending)
  counts.sort((a, b) => {
    if (a.avg === 0 && b.avg === 0) return 0;
    if (a.avg === 0) return 1;
    if (b.avg === 0) return -1;

    // Prefer delimiter with consistent counts across lines
    const varianceWeight = 0.1;
    return b.avg - a.avg - varianceWeight * (b.variance - a.variance);
  });

  // Return most common delimiter (semicolon is typical for BMD Austrian format)
  return counts[0].delimiter;
}

/**
 * Check if content is NTCS format
 */
function isNtcsFormat(content: string): { isNtcs: boolean; confidence: number } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return { isNtcs: false, confidence: 0 };
  }

  let confidence = 0;
  let validRecords = 0;

  // Check first line for header
  const firstLine = lines[0].trim();
  if (firstLine.startsWith('HD;')) {
    confidence += 0.4;
    validRecords++;
  } else {
    return { isNtcs: false, confidence: 0 };
  }

  // Check for valid record types
  const validRecordTypes = Object.values(NtcsRecordType);
  const sampleSize = Math.min(10, lines.length);

  for (let i = 1; i < sampleSize; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const recordType = line.split(';')[0];
    if (validRecordTypes.includes(recordType as NtcsRecordType)) {
      validRecords++;
    }
  }

  // Calculate confidence based on valid records
  const validRatio = validRecords / sampleSize;
  confidence += validRatio * 0.6;

  return {
    isNtcs: confidence > 0.5,
    confidence: Math.min(confidence, 1),
  };
}

/**
 * Check if content is CSV format
 */
function isCsvFormat(content: string, delimiter: string): { isCsv: boolean; confidence: number; exportType?: BmdCsvExportType } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return { isCsv: false, confidence: 0 };
  }

  let confidence = 0;

  // Check first line for headers
  const firstLine = lines[0];
  const headers = firstLine.split(delimiter).map((h) => h.trim());

  if (headers.length < 2) {
    return { isCsv: false, confidence: 0 };
  }

  confidence += 0.3;

  // Try to detect export type
  const exportType = detectCsvExportType(headers);
  if (exportType) {
    confidence += 0.4;
  }

  // Check for consistent column counts
  const expectedColumns = headers.length;
  const sampleSize = Math.min(10, lines.length);
  let consistentLines = 0;

  for (let i = 1; i < sampleSize; i++) {
    const fields = lines[i].split(delimiter);
    if (fields.length === expectedColumns) {
      consistentLines++;
    }
  }

  const consistencyRatio = consistentLines / (sampleSize - 1);
  confidence += consistencyRatio * 0.3;

  return {
    isCsv: confidence > 0.5,
    confidence: Math.min(confidence, 1),
    exportType,
  };
}

/**
 * Detect BMD file format from content
 */
export function detectFileFormat(content: string): FileDetectionResult {
  const result: FileDetectionResult = {
    format: BmdFileFormat.UNKNOWN,
    confidence: 0,
    errors: [],
    warnings: [],
    metadata: {
      lines: content.split(/\r?\n/).length,
      size: content.length,
    },
  };

  // Try NTCS format first
  const ntcsCheck = isNtcsFormat(content);
  if (ntcsCheck.isNtcs) {
    result.format = BmdFileFormat.NTCS;
    result.confidence = ntcsCheck.confidence;
    return result;
  }

  // Try CSV format
  const delimiter = detectCsvDelimiter(content);
  const csvCheck = isCsvFormat(content, delimiter);

  if (csvCheck.isCsv) {
    result.format = BmdFileFormat.CSV;
    result.confidence = csvCheck.confidence;
    result.delimiter = delimiter;
    result.csvExportType = csvCheck.exportType;
    result.metadata!.hasHeader = true;
    return result;
  }

  // Could not detect format
  result.errors.push('Could not detect file format');
  result.warnings.push('File does not match NTCS or CSV format');

  return result;
}

/**
 * Detect BMD file format from buffer
 */
export function detectFileFormatFromBuffer(buffer: Buffer): FileDetectionResult {
  const encoding = detectEncoding(buffer);
  const content = buffer.toString(encoding);
  const result = detectFileFormat(content);
  result.encoding = encoding;
  return result;
}

/**
 * NTCS Parser implementation
 */
class NtcsParser implements BmdParser {
  private options: NtcsParserOptions;

  constructor(options: NtcsParserOptions = {}) {
    this.options = options;
  }

  parse(content: string): NtcsParseResult {
    return parseNtcsFile(content, this.options);
  }

  parseBuffer(buffer: Buffer): NtcsParseResult {
    return parseNtcsBuffer(buffer, this.options);
  }

  validate(content: string): { valid: boolean; errors: string[] } {
    return validateNtcsFile(content);
  }
}

/**
 * CSV Parser implementation
 */
class CsvParser implements BmdParser {
  private options: CsvParserOptions;

  constructor(options: CsvParserOptions = {}) {
    this.options = options;
  }

  parse(content: string): CsvParseResult<unknown> {
    return parseBmdCsvFile(content, this.options);
  }

  parseBuffer(buffer: Buffer): CsvParseResult<unknown> {
    return parseBmdCsvBuffer(buffer, this.options);
  }

  validate(content: string): { valid: boolean; errors: string[] } {
    return validateBmdCsvFile(content, this.options);
  }
}

/**
 * Get appropriate parser for detected format
 */
export function getParserForFormat(
  format: BmdFileFormat,
  options?: {
    ntcsOptions?: NtcsParserOptions;
    csvOptions?: CsvParserOptions;
  }
): BmdParser {
  switch (format) {
    case BmdFileFormat.NTCS:
      return new NtcsParser(options?.ntcsOptions);

    case BmdFileFormat.CSV:
      return new CsvParser(options?.csvOptions);

    default:
      throw new Error(`Unsupported file format: ${format}`);
  }
}

/**
 * Auto-detect format and return appropriate parser
 */
export function autoDetectAndGetParser(
  content: string,
  options?: {
    ntcsOptions?: NtcsParserOptions;
    csvOptions?: CsvParserOptions;
  }
): ParserFactoryResult {
  const detection = detectFileFormat(content);

  if (detection.format === BmdFileFormat.UNKNOWN) {
    throw new Error('Could not detect file format: ' + detection.errors.join(', '));
  }

  // Update CSV options with detected delimiter
  const csvOptions = options?.csvOptions || {};
  if (detection.format === BmdFileFormat.CSV && detection.delimiter) {
    csvOptions.delimiter = detection.delimiter;
  }

  return {
    format: detection.format,
    parser: getParserForFormat(detection.format, {
      ntcsOptions: options?.ntcsOptions,
      csvOptions,
    }),
  };
}

/**
 * Auto-detect format from buffer and return appropriate parser
 */
export function autoDetectAndGetParserFromBuffer(
  buffer: Buffer,
  options?: {
    ntcsOptions?: NtcsParserOptions;
    csvOptions?: CsvParserOptions;
  }
): ParserFactoryResult {
  const detection = detectFileFormatFromBuffer(buffer);

  if (detection.format === BmdFileFormat.UNKNOWN) {
    throw new Error('Could not detect file format: ' + detection.errors.join(', '));
  }

  // Update options with detected encoding and delimiter
  const ntcsOptions = options?.ntcsOptions || {};
  const csvOptions = options?.csvOptions || {};

  if (detection.encoding) {
    ntcsOptions.encoding = detection.encoding;
    csvOptions.encoding = detection.encoding;
  }

  if (detection.format === BmdFileFormat.CSV && detection.delimiter) {
    csvOptions.delimiter = detection.delimiter;
  }

  return {
    format: detection.format,
    parser: getParserForFormat(detection.format, {
      ntcsOptions,
      csvOptions,
    }),
  };
}

/**
 * Convenience function: auto-detect and parse file
 */
export function autoParseFile(
  content: string,
  options?: {
    ntcsOptions?: NtcsParserOptions;
    csvOptions?: CsvParserOptions;
  }
): BmdParseResult {
  const result = autoDetectAndGetParser(content, options);
  return result.parser.parse(content);
}

/**
 * Convenience function: auto-detect and parse buffer
 */
export function autoParseBuffer(
  buffer: Buffer,
  options?: {
    ntcsOptions?: NtcsParserOptions;
    csvOptions?: CsvParserOptions;
  }
): BmdParseResult {
  const result = autoDetectAndGetParserFromBuffer(buffer, options);
  return result.parser.parseBuffer(buffer);
}

/**
 * Validate file format
 */
export function validateFileFormat(
  content: string,
  expectedFormat?: BmdFileFormat
): { valid: boolean; errors: string[]; warnings: string[] } {
  const detection = detectFileFormat(content);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if format was detected
  if (detection.format === BmdFileFormat.UNKNOWN) {
    errors.push(...detection.errors);
    warnings.push(...detection.warnings);
    return { valid: false, errors, warnings };
  }

  // Check if format matches expected format
  if (expectedFormat && detection.format !== expectedFormat) {
    errors.push(`Expected ${expectedFormat} format, but detected ${detection.format}`);
    return { valid: false, errors, warnings };
  }

  // Validate using format-specific validator
  try {
    const parser = getParserForFormat(detection.format);
    const validation = parser.validate(content);

    if (!validation.valid) {
      errors.push(...validation.errors);
    }
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [...warnings, ...detection.warnings],
  };
}

/**
 * Export types and enums
 */
export type {
  FileDetectionResult,
  ParserFactoryResult,
  BmdParser,
  BmdParseResult,
};

export { BmdCsvExportType, NtcsRecordType };
