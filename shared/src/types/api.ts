/**
 * API Response and Error Types
 */

export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface PaginationMeta extends ResponseMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp?: string;
}

export interface ValidationError extends ApiError {
  error: 'Validation Error';
  validationErrors: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

// Common query parameters
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
}

export interface ListParams extends PaginationParams, SortParams, FilterParams {}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  latency?: number;
  message?: string;
}

// Job status types
export interface JobStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Export types
export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  filters?: FilterParams;
  fields?: string[];
}

export interface ExportResponse {
  url: string;
  expiresAt: Date;
  format: string;
  size: number;
}

// Batch operation types
export interface BatchRequest<T> {
  items: T[];
}

export interface BatchResponse<T> {
  successful: T[];
  failed: BatchError[];
}

export interface BatchError {
  index: number;
  error: string;
  item?: unknown;
}
