/**
 * Connector Errors Hook (T203)
 * TanStack Query hooks for fetching and managing connector errors
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Type Definitions
export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ErrorCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'VALIDATION'
  | 'DATA_PROCESSING'
  | 'CONFIGURATION'
  | 'SYNC'
  | 'UNKNOWN';

export interface ConnectorError {
  id: string;
  connectorInstanceId: string;
  syncJobId?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code?: string;
  message: string;
  details?: Record<string, unknown>;
  stackTrace?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErrorSummary {
  total: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  unresolved: number;
  resolved: number;
  recentErrors: ConnectorError[];
}

export interface ErrorFilters {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  resolved?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'occurredAt' | 'severity' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface ResolveErrorInput {
  resolution: string;
}

export interface ErrorTrend {
  date: string;
  count: number;
  byCategory: Record<ErrorCategory, number>;
}

// API Response Types
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Fetch errors for a specific connector instance
 */
export function useConnectorErrors(
  organizationId: string,
  instanceId: string,
  filters?: ErrorFilters
) {
  const params = new URLSearchParams();
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.resolved !== undefined) params.append('resolved', String(filters.resolved));
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.limit) params.append('limit', String(filters.limit));
  if (filters?.sortBy) params.append('sortBy', filters.sortBy);
  if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors', filters],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ConnectorError>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors?${params}`
      );
      return response;
    },
    enabled: !!organizationId && !!instanceId,
  });
}

/**
 * Fetch a specific connector error
 */
export function useConnectorError(
  organizationId: string,
  instanceId: string,
  errorId: string
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors', errorId],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ConnectorError>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/${errorId}`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId && !!errorId,
  });
}

/**
 * Fetch error summary for a connector instance
 */
export function useConnectorErrorSummary(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorSummary'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ErrorSummary>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/summary`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Fetch error trends over time
 */
export function useConnectorErrorTrends(
  organizationId: string,
  instanceId: string,
  days: number = 30
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorTrends', days],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ErrorTrend[]>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/trends?days=${days}`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Mark an error as resolved
 */
export function useResolveConnectorError(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      errorId,
      resolution,
    }: {
      errorId: string;
      resolution: string;
    }) => {
      const response = await apiClient.post<ApiResponse<ConnectorError>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/${errorId}/resolve`,
        { resolution }
      );
      return response.data;
    },
    onMutate: async ({ errorId, resolution }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors', errorId],
      });

      // Snapshot previous value
      const previousError = queryClient.getQueryData<ConnectorError>([
        'connectors',
        'instances',
        organizationId,
        instanceId,
        'errors',
        errorId,
      ]);

      // Optimistically update
      if (previousError) {
        queryClient.setQueryData<ConnectorError>(
          ['connectors', 'instances', organizationId, instanceId, 'errors', errorId],
          {
            ...previousError,
            resolvedAt: new Date().toISOString(),
            resolution,
          }
        );
      }

      return { previousError };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousError) {
        queryClient.setQueryData(
          ['connectors', 'instances', organizationId, instanceId, 'errors', variables.errorId],
          context.previousError
        );
      }
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors'],
      });
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorSummary'],
      });
    },
  });
}

/**
 * Bulk resolve multiple errors
 */
export function useBulkResolveErrors(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      errorIds,
      resolution,
    }: {
      errorIds: string[];
      resolution: string;
    }) => {
      const response = await apiClient.post<ApiResponse<{ resolved: number }>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/bulk-resolve`,
        { errorIds, resolution }
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all error queries
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors'],
      });
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorSummary'],
      });
    },
  });
}

/**
 * Delete an error record
 */
export function useDeleteConnectorError(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (errorId: string) => {
      await apiClient.delete(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/${errorId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors'],
      });
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorSummary'],
      });
    },
  });
}

/**
 * Fetch unresolved errors count
 */
export function useUnresolvedErrorsCount(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'unresolvedCount'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ count: number }>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/unresolved/count`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

/**
 * Fetch errors across all connectors in an organization
 */
export function useOrganizationConnectorErrors(
  organizationId: string,
  filters?: ErrorFilters
) {
  const params = new URLSearchParams();
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.resolved !== undefined) params.append('resolved', String(filters.resolved));
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.limit) params.append('limit', String(filters.limit));
  if (filters?.sortBy) params.append('sortBy', filters.sortBy);
  if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

  return useQuery({
    queryKey: ['connectors', 'errors', organizationId, filters],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ConnectorError>>(
        `/organizations/${organizationId}/connectors/errors?${params}`
      );
      return response;
    },
    enabled: !!organizationId,
  });
}

/**
 * Get error statistics for an organization
 */
export function useOrganizationErrorStats(organizationId: string) {
  return useQuery({
    queryKey: ['connectors', 'errors', organizationId, 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ErrorSummary>>(
        `/organizations/${organizationId}/connectors/errors/stats`
      );
      return response.data;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Re-open a resolved error
 */
export function useReopenConnectorError(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ errorId, reason }: { errorId: string; reason?: string }) => {
      const response = await apiClient.post<ApiResponse<ConnectorError>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/${errorId}/reopen`,
        { reason }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors'],
      });
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'errorSummary'],
      });
    },
  });
}

/**
 * Get similar errors (for pattern detection)
 */
export function useSimilarErrors(
  organizationId: string,
  instanceId: string,
  errorId: string
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'errors', errorId, 'similar'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ConnectorError[]>>(
        `/organizations/${organizationId}/connectors/${instanceId}/errors/${errorId}/similar`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId && !!errorId,
  });
}
