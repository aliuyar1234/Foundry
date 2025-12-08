/**
 * Connector Sync Hook (T202)
 * TanStack Query hooks for triggering and monitoring sync operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Type Definitions
export type JobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface SyncJob {
  id: string;
  dataSourceId: string;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  eventsCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SyncProgress {
  jobId: string;
  current: number;
  total: number;
  stage: string;
  message?: string;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface SyncOptions {
  fullSync?: boolean;
  lookbackMonths?: number;
  syncEmails?: boolean;
  syncCalendar?: boolean;
  syncFiles?: boolean;
}

export interface SyncStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageDuration: number;
  totalEventsProcessed: number;
  lastSyncAt?: string;
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
 * Fetch sync jobs for a connector instance
 */
export function useConnectorSyncJobs(
  organizationId: string,
  instanceId: string,
  options?: {
    limit?: number;
    status?: JobStatus;
  }
) {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.status) params.append('status', options.status);

  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', options],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<SyncJob>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs?${params}`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    refetchInterval: (data) => {
      // Auto-refetch if there are running jobs
      const hasRunningJobs = data?.some(
        (job) => job.status === 'RUNNING' || job.status === 'PENDING'
      );
      return hasRunningJobs ? 2000 : false; // Poll every 2 seconds
    },
  });
}

/**
 * Fetch a specific sync job
 */
export function useConnectorSyncJob(
  organizationId: string,
  instanceId: string,
  jobId: string
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SyncJob>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/${jobId}`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId && !!jobId,
    refetchInterval: (data) => {
      // Auto-refetch while job is running
      return data && (data.status === 'RUNNING' || data.status === 'PENDING')
        ? 2000
        : false;
    },
  });
}

/**
 * Fetch real-time sync progress for a job
 */
export function useSyncProgress(
  organizationId: string,
  instanceId: string,
  jobId: string
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId, 'progress'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SyncProgress>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/${jobId}/progress`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId && !!jobId,
    refetchInterval: 1000, // Poll every second for real-time updates
  });
}

/**
 * Trigger a sync operation
 */
export function useTriggerSync(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: SyncOptions = {}) => {
      const response = await apiClient.post<ApiResponse<SyncJob>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync`,
        options
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate sync jobs list to show new job
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs'],
      });

      // Invalidate connector instance to update lastSyncAt
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId],
      });

      // Set query data for the new job
      queryClient.setQueryData(
        ['connectors', 'instances', organizationId, instanceId, 'syncJobs', data.id],
        data
      );
    },
  });
}

/**
 * Cancel a running sync job
 */
export function useCancelSync(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiClient.post<ApiResponse<SyncJob>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/${jobId}/cancel`
      );
      return response.data;
    },
    onMutate: async (jobId) => {
      // Optimistically update the job status
      await queryClient.cancelQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId],
      });

      const previousJob = queryClient.getQueryData<SyncJob>([
        'connectors',
        'instances',
        organizationId,
        instanceId,
        'syncJobs',
        jobId,
      ]);

      if (previousJob) {
        queryClient.setQueryData<SyncJob>(
          ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId],
          {
            ...previousJob,
            status: 'CANCELLED',
          }
        );
      }

      return { previousJob };
    },
    onError: (err, jobId, context) => {
      // Rollback on error
      if (context?.previousJob) {
        queryClient.setQueryData(
          ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId],
          context.previousJob
        );
      }
    },
    onSuccess: () => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs'],
      });
    },
  });
}

/**
 * Retry a failed sync job
 */
export function useRetrySync(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiClient.post<ApiResponse<SyncJob>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/${jobId}/retry`
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate sync jobs list to show retried job
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs'],
      });

      // Set query data for the new job
      queryClient.setQueryData(
        ['connectors', 'instances', organizationId, instanceId, 'syncJobs', data.id],
        data
      );
    },
  });
}

/**
 * Get sync statistics for a connector
 */
export function useSyncStats(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncStats'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SyncStats>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-stats`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get the latest sync job
 */
export function useLatestSyncJob(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', 'latest'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SyncJob | null>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/latest`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    refetchInterval: (data) => {
      // Auto-refetch if latest job is running
      return data && (data.status === 'RUNNING' || data.status === 'PENDING')
        ? 2000
        : 30000; // Poll every 2s if running, otherwise every 30s
    },
  });
}

/**
 * Check if a sync is currently running
 */
export function useIsSyncRunning(organizationId: string, instanceId: string) {
  const { data: latestJob } = useLatestSyncJob(organizationId, instanceId);

  return {
    isRunning: latestJob?.status === 'RUNNING' || latestJob?.status === 'PENDING',
    currentJob: latestJob,
  };
}

/**
 * Subscribe to sync status updates via WebSocket (optional enhancement)
 * This would require WebSocket setup on the backend
 */
export function useSyncStatusSubscription(
  organizationId: string,
  instanceId: string,
  jobId: string,
  onStatusChange?: (status: JobStatus) => void
) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs', jobId, 'status'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ status: JobStatus }>>(
        `/organizations/${organizationId}/connectors/${instanceId}/sync-jobs/${jobId}/status`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId && !!jobId,
    refetchInterval: 1000, // Poll every second
    onSuccess: (data) => {
      if (onStatusChange && data.status) {
        onStatusChange(data.status);
      }
    },
  });
}

/**
 * Bulk trigger sync for multiple connectors
 */
export function useBulkTriggerSync(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceIds,
      options = {},
    }: {
      instanceIds: string[];
      options?: SyncOptions;
    }) => {
      const response = await apiClient.post<ApiResponse<SyncJob[]>>(
        `/organizations/${organizationId}/connectors/bulk-sync`,
        { instanceIds, options }
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate sync jobs for all affected connectors
      variables.instanceIds.forEach((instanceId) => {
        queryClient.invalidateQueries({
          queryKey: ['connectors', 'instances', organizationId, instanceId, 'syncJobs'],
        });
        queryClient.invalidateQueries({
          queryKey: ['connectors', 'instances', organizationId, instanceId],
        });
      });
    },
  });
}
