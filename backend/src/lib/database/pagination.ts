/**
 * Pagination Utilities
 * T353 - Implement pagination for all list endpoints
 *
 * Provides standardized pagination patterns for API responses
 * with cursor-based and offset-based pagination support.
 */

export interface OffsetPaginationParams {
  page?: number;
  pageSize?: number;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

export interface OffsetPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    nextCursor: string | null;
    previousCursor: string | null;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    limit: number;
  };
}

export interface PaginationConfig {
  defaultPageSize: number;
  maxPageSize: number;
  defaultLimit: number;
  maxLimit: number;
}

const DEFAULT_CONFIG: PaginationConfig = {
  defaultPageSize: 20,
  maxPageSize: 100,
  defaultLimit: 20,
  maxLimit: 100,
};

let config: PaginationConfig = DEFAULT_CONFIG;

/**
 * Configure pagination defaults
 */
export function configurePagination(options: Partial<PaginationConfig>): void {
  config = { ...DEFAULT_CONFIG, ...options };
}

// ==========================================================================
// Offset-Based Pagination
// ==========================================================================

/**
 * Normalize offset pagination parameters
 */
export function normalizeOffsetParams(
  params: OffsetPaginationParams
): Required<OffsetPaginationParams> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(
    config.maxPageSize,
    Math.max(1, params.pageSize || config.defaultPageSize)
  );

  return { page, pageSize };
}

/**
 * Calculate offset for database query
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Build offset paginated response
 */
export function buildOffsetResponse<T>(
  data: T[],
  total: number,
  params: Required<OffsetPaginationParams>
): OffsetPaginatedResponse<T> {
  const { page, pageSize } = params;
  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Helper to paginate an array
 */
export function paginateArray<T>(
  array: T[],
  params: OffsetPaginationParams
): OffsetPaginatedResponse<T> {
  const normalized = normalizeOffsetParams(params);
  const { page, pageSize } = normalized;
  const offset = calculateOffset(page, pageSize);

  const data = array.slice(offset, offset + pageSize);
  return buildOffsetResponse(data, array.length, normalized);
}

// ==========================================================================
// Cursor-Based Pagination
// ==========================================================================

/**
 * Normalize cursor pagination parameters
 */
export function normalizeCursorParams(
  params: CursorPaginationParams
): Required<CursorPaginationParams> {
  const limit = Math.min(
    config.maxLimit,
    Math.max(1, params.limit || config.defaultLimit)
  );
  const direction = params.direction || 'forward';

  return {
    cursor: params.cursor || '',
    limit,
    direction,
  };
}

/**
 * Encode cursor from object
 */
export function encodeCursor(data: Record<string, any>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode cursor to object
 */
export function decodeCursor(cursor: string): Record<string, any> | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Build cursor from record (typically using id and timestamp)
 */
export function buildCursor(
  record: { id: string; createdAt?: Date | string; [key: string]: any },
  sortField: string = 'createdAt'
): string {
  const sortValue = record[sortField];
  return encodeCursor({
    id: record.id,
    [sortField]: sortValue instanceof Date ? sortValue.toISOString() : sortValue,
  });
}

/**
 * Build cursor paginated response
 */
export function buildCursorResponse<T extends { id: string }>(
  data: T[],
  params: Required<CursorPaginationParams>,
  sortField: string = 'createdAt',
  hasMore: boolean = false
): CursorPaginatedResponse<T> {
  const { limit, cursor, direction } = params;

  // Determine next/previous cursors
  let nextCursor: string | null = null;
  let previousCursor: string | null = null;

  if (data.length > 0) {
    const firstRecord = data[0];
    const lastRecord = data[data.length - 1];

    if (direction === 'forward') {
      if (hasMore || data.length === limit) {
        nextCursor = buildCursor(lastRecord as any, sortField);
      }
      if (cursor) {
        previousCursor = buildCursor(firstRecord as any, sortField);
      }
    } else {
      if (cursor) {
        nextCursor = buildCursor(firstRecord as any, sortField);
      }
      if (hasMore || data.length === limit) {
        previousCursor = buildCursor(lastRecord as any, sortField);
      }
    }
  }

  return {
    data,
    pagination: {
      cursor: cursor || null,
      nextCursor,
      previousCursor,
      hasNextPage: nextCursor !== null,
      hasPreviousPage: previousCursor !== null,
      limit,
    },
  };
}

/**
 * Build Prisma cursor-based query options
 */
export function buildPrismaCursorQuery(
  params: Required<CursorPaginationParams>,
  sortField: string = 'createdAt',
  sortDirection: 'asc' | 'desc' = 'desc'
): {
  cursor?: { id: string };
  skip?: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'>;
} {
  const { cursor, limit, direction } = params;

  const options: {
    cursor?: { id: string };
    skip?: number;
    take: number;
    orderBy: Record<string, 'asc' | 'desc'>;
  } = {
    take: direction === 'forward' ? limit : -limit,
    orderBy: { [sortField]: sortDirection },
  };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      options.cursor = { id: decoded.id };
      options.skip = 1; // Skip the cursor record itself
    }
  }

  return options;
}

// ==========================================================================
// Hybrid Pagination (supports both offset and cursor)
// ==========================================================================

export type PaginationMode = 'offset' | 'cursor';

export interface HybridPaginationParams {
  mode?: PaginationMode;
  // Offset params
  page?: number;
  pageSize?: number;
  // Cursor params
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

export type HybridPaginatedResponse<T> =
  | OffsetPaginatedResponse<T>
  | CursorPaginatedResponse<T>;

/**
 * Detect pagination mode from params
 */
export function detectPaginationMode(
  params: HybridPaginationParams
): PaginationMode {
  if (params.mode) return params.mode;
  if (params.cursor) return 'cursor';
  if (params.page !== undefined) return 'offset';
  return 'offset'; // Default to offset
}

/**
 * Build pagination info for API responses (Link header format)
 */
export function buildPaginationLinks(
  baseUrl: string,
  pagination: OffsetPaginatedResponse<any>['pagination'] | CursorPaginatedResponse<any>['pagination']
): string[] {
  const links: string[] = [];

  if ('page' in pagination) {
    // Offset pagination links
    const { page, pageSize, totalPages } = pagination;

    if (page > 1) {
      links.push(`<${baseUrl}?page=1&pageSize=${pageSize}>; rel="first"`);
      links.push(`<${baseUrl}?page=${page - 1}&pageSize=${pageSize}>; rel="prev"`);
    }

    if (page < totalPages) {
      links.push(`<${baseUrl}?page=${page + 1}&pageSize=${pageSize}>; rel="next"`);
      links.push(`<${baseUrl}?page=${totalPages}&pageSize=${pageSize}>; rel="last"`);
    }
  } else {
    // Cursor pagination links
    const { nextCursor, previousCursor, limit } = pagination;

    if (previousCursor) {
      links.push(
        `<${baseUrl}?cursor=${previousCursor}&limit=${limit}&direction=backward>; rel="prev"`
      );
    }

    if (nextCursor) {
      links.push(
        `<${baseUrl}?cursor=${nextCursor}&limit=${limit}&direction=forward>; rel="next"`
      );
    }
  }

  return links;
}

/**
 * Build pagination metadata for response headers
 */
export function buildPaginationHeaders(
  pagination: OffsetPaginatedResponse<any>['pagination'] | CursorPaginatedResponse<any>['pagination']
): Record<string, string> {
  const headers: Record<string, string> = {};

  if ('totalItems' in pagination) {
    headers['X-Total-Count'] = String(pagination.totalItems);
    headers['X-Total-Pages'] = String(pagination.totalPages);
    headers['X-Page'] = String(pagination.page);
    headers['X-Page-Size'] = String(pagination.pageSize);
  }

  headers['X-Has-Next-Page'] = String(pagination.hasNextPage);
  headers['X-Has-Previous-Page'] = String(pagination.hasPreviousPage);

  return headers;
}

// ==========================================================================
// Utility Functions
// ==========================================================================

/**
 * Validate page number
 */
export function isValidPage(page: number): boolean {
  return Number.isInteger(page) && page >= 1;
}

/**
 * Validate page size
 */
export function isValidPageSize(pageSize: number): boolean {
  return Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= config.maxPageSize;
}

/**
 * Validate cursor format
 */
export function isValidCursor(cursor: string): boolean {
  if (!cursor) return false;
  const decoded = decodeCursor(cursor);
  return decoded !== null && typeof decoded.id === 'string';
}

/**
 * Get effective limit after validation
 */
export function getEffectiveLimit(requestedLimit?: number): number {
  if (!requestedLimit) return config.defaultLimit;
  return Math.min(Math.max(1, requestedLimit), config.maxLimit);
}

/**
 * Get effective page size after validation
 */
export function getEffectivePageSize(requestedSize?: number): number {
  if (!requestedSize) return config.defaultPageSize;
  return Math.min(Math.max(1, requestedSize), config.maxPageSize);
}

export default {
  configurePagination,
  normalizeOffsetParams,
  calculateOffset,
  buildOffsetResponse,
  paginateArray,
  normalizeCursorParams,
  encodeCursor,
  decodeCursor,
  buildCursor,
  buildCursorResponse,
  buildPrismaCursorQuery,
  detectPaginationMode,
  buildPaginationLinks,
  buildPaginationHeaders,
  isValidPage,
  isValidPageSize,
  isValidCursor,
  getEffectiveLimit,
  getEffectivePageSize,
};
