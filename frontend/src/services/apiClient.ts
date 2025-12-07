/**
 * API Client Wrapper
 * Provides typed HTTP client for backend API
 */

import type { ApiError, PaginatedResponse, ApiResponse } from '@eaif/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  // Get auth token from storage
  const token = localStorage.getItem('accessToken');

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  // Handle empty responses
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = data as ApiError;
    throw new ApiClientError(
      error.message || 'An error occurred',
      response.status,
      error.code,
      error.details
    );
  }

  return data as T;
}

// HTTP method helpers
export const apiClient = {
  get: <T>(endpoint: string, signal?: AbortSignal): Promise<T> =>
    request<T>(endpoint, { method: 'GET', signal }),

  post: <T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(endpoint, { method: 'POST', body, signal }),

  put: <T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(endpoint, { method: 'PUT', body, signal }),

  patch: <T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(endpoint, { method: 'PATCH', body, signal }),

  delete: <T>(endpoint: string, signal?: AbortSignal): Promise<T> =>
    request<T>(endpoint, { method: 'DELETE', signal }),
};

// Typed API endpoints
export const api = {
  // Health
  health: () => apiClient.get<{ status: string; version: string }>('/health'),

  // Organizations
  organizations: {
    list: () => apiClient.get<PaginatedResponse<unknown>>('/organizations'),
    get: (id: string) => apiClient.get<ApiResponse<unknown>>(`/organizations/${id}`),
    create: (data: unknown) => apiClient.post<ApiResponse<unknown>>('/organizations', data),
    update: (id: string, data: unknown) =>
      apiClient.patch<ApiResponse<unknown>>(`/organizations/${id}`, data),
    delete: (id: string) => apiClient.delete(`/organizations/${id}`),
    stats: (id: string) => apiClient.get<ApiResponse<unknown>>(`/organizations/${id}/stats`),
  },

  // Data Sources
  dataSources: {
    list: (orgId: string) =>
      apiClient.get<PaginatedResponse<unknown>>(`/organizations/${orgId}/data-sources`),
    get: (orgId: string, id: string) =>
      apiClient.get<ApiResponse<unknown>>(`/organizations/${orgId}/data-sources/${id}`),
    create: (orgId: string, data: unknown) =>
      apiClient.post<ApiResponse<unknown>>(`/organizations/${orgId}/data-sources`, data),
    update: (orgId: string, id: string, data: unknown) =>
      apiClient.patch<ApiResponse<unknown>>(`/organizations/${orgId}/data-sources/${id}`, data),
    delete: (orgId: string, id: string) =>
      apiClient.delete(`/organizations/${orgId}/data-sources/${id}`),
    sync: (orgId: string, id: string) =>
      apiClient.post<ApiResponse<unknown>>(`/organizations/${orgId}/data-sources/${id}/sync`),
  },

  // Discovery
  discovery: {
    processes: (orgId: string) =>
      apiClient.get<PaginatedResponse<unknown>>(`/organizations/${orgId}/discovery/processes`),
    process: (orgId: string, id: string) =>
      apiClient.get<ApiResponse<unknown>>(`/organizations/${orgId}/discovery/processes/${id}`),
    network: (orgId: string, params?: Record<string, string>) => {
      const query = params ? `?${new URLSearchParams(params)}` : '';
      return apiClient.get<ApiResponse<unknown>>(
        `/organizations/${orgId}/discovery/network${query}`
      );
    },
    insights: (orgId: string) =>
      apiClient.get<PaginatedResponse<unknown>>(`/organizations/${orgId}/discovery/insights`),
    busFactor: (orgId: string) =>
      apiClient.get<ApiResponse<unknown>>(`/organizations/${orgId}/discovery/bus-factor`),
    analyze: (orgId: string, data?: unknown) =>
      apiClient.post<ApiResponse<unknown>>(`/organizations/${orgId}/discovery/analyze`, data),
  },

  // Assessments
  assessments: {
    list: (orgId: string) =>
      apiClient.get<PaginatedResponse<unknown>>(`/organizations/${orgId}/assessments`),
    get: (orgId: string, id: string) =>
      apiClient.get<ApiResponse<unknown>>(`/organizations/${orgId}/assessments/${id}`),
    create: (orgId: string, data: unknown) =>
      apiClient.post<ApiResponse<unknown>>(`/organizations/${orgId}/assessments`, data),
    export: (orgId: string, id: string, format: string) =>
      apiClient.post<ApiResponse<{ url: string }>>(
        `/organizations/${orgId}/assessments/${id}/export`,
        { format }
      ),
  },

  // SOPs
  sops: {
    list: (orgId: string) =>
      apiClient.get<PaginatedResponse<unknown>>(`/organizations/${orgId}/sops`),
    get: (orgId: string, id: string) =>
      apiClient.get<ApiResponse<unknown>>(`/organizations/${orgId}/sops/${id}`),
    create: (orgId: string, data: unknown) =>
      apiClient.post<ApiResponse<unknown>>(`/organizations/${orgId}/sops`, data),
    update: (orgId: string, id: string, data: unknown) =>
      apiClient.patch<ApiResponse<unknown>>(`/organizations/${orgId}/sops/${id}`, data),
    export: (orgId: string, id: string, format: string) =>
      apiClient.post<ApiResponse<{ url: string }>>(
        `/organizations/${orgId}/sops/${id}/export`,
        { format }
      ),
  },
};
