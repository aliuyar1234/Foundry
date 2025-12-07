/**
 * Data Sources Hooks
 * TanStack Query hooks for data source operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface DataSource {
  id: string;
  name: string;
  type: 'M365' | 'GOOGLE_WORKSPACE' | 'SLACK' | 'SALESFORCE' | 'CUSTOM';
  status: 'PENDING' | 'CONNECTED' | 'SYNCING' | 'ERROR' | 'DISCONNECTED';
  lastSyncAt?: string;
  lastSyncStatus?: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  dataSourceId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  eventsCount?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CreateDataSourceInput {
  name: string;
  type: DataSource['type'];
  config?: Record<string, unknown>;
}

// Query keys
export const dataSourceKeys = {
  all: ['dataSources'] as const,
  lists: () => [...dataSourceKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...dataSourceKeys.lists(), filters] as const,
  details: () => [...dataSourceKeys.all, 'detail'] as const,
  detail: (id: string) => [...dataSourceKeys.details(), id] as const,
  syncJobs: (id: string) => [...dataSourceKeys.detail(id), 'syncJobs'] as const,
};

/**
 * Fetch all data sources
 */
export function useDataSources() {
  return useQuery({
    queryKey: dataSourceKeys.lists(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: DataSource[] }>(
        '/data-sources'
      );
      return response.data;
    },
  });
}

/**
 * Fetch a single data source
 */
export function useDataSource(id: string) {
  return useQuery({
    queryKey: dataSourceKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: DataSource }>(
        `/data-sources/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch sync jobs for a data source
 */
export function useSyncJobs(dataSourceId: string) {
  return useQuery({
    queryKey: dataSourceKeys.syncJobs(dataSourceId),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SyncJob[] }>(
        `/data-sources/${dataSourceId}/sync-jobs`
      );
      return response.data;
    },
    enabled: !!dataSourceId,
  });
}

/**
 * Create a new data source
 */
export function useCreateDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDataSourceInput) => {
      const response = await apiClient.post<{ success: boolean; data: DataSource }>(
        '/data-sources',
        input
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
    },
  });
}

/**
 * Delete a data source
 */
export function useDeleteDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/data-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.lists() });
    },
  });
}

/**
 * Trigger a sync job
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dataSourceId,
      fullSync = false,
    }: {
      dataSourceId: string;
      fullSync?: boolean;
    }) => {
      const response = await apiClient.post<{ success: boolean; data: SyncJob }>(
        `/data-sources/${dataSourceId}/sync`,
        { fullSync }
      );
      return response.data;
    },
    onSuccess: (_, { dataSourceId }) => {
      queryClient.invalidateQueries({
        queryKey: dataSourceKeys.syncJobs(dataSourceId),
      });
      queryClient.invalidateQueries({
        queryKey: dataSourceKeys.detail(dataSourceId),
      });
    },
  });
}

/**
 * Test data source connection
 */
export function useTestConnection() {
  return useMutation({
    mutationFn: async (dataSourceId: string) => {
      const response = await apiClient.post<{
        success: boolean;
        data: { success: boolean; error?: string };
      }>(`/data-sources/${dataSourceId}/test`);
      return response.data;
    },
  });
}

/**
 * Get OAuth authorization URL
 */
export function useGetAuthUrl() {
  return useMutation({
    mutationFn: async ({
      dataSourceId,
      redirectUri,
    }: {
      dataSourceId: string;
      redirectUri: string;
    }) => {
      const response = await apiClient.post<{
        success: boolean;
        data: { authorizationUrl: string; state: string };
      }>(`/data-sources/${dataSourceId}/auth/url`, { redirectUri });
      return response.data;
    },
  });
}
