/**
 * Process Hooks
 * React Query hooks for process management (from discovery)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Types
export interface Process {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  category?: string;
  status: 'discovered' | 'analyzed' | 'documented' | 'optimized';
  stepCount?: number;
  instanceCount?: number;
  avgDuration?: number;
  minDuration?: number;
  maxDuration?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessStep {
  id: string;
  processId: string;
  name: string;
  description?: string;
  sequence: number;
  type: 'start' | 'end' | 'task' | 'decision' | 'parallel' | 'subprocess';
  performer?: string;
  system?: string;
  avgDuration?: number;
  frequency?: number;
  inputs?: string[];
  outputs?: string[];
  metadata?: Record<string, unknown>;
}

export interface ProcessWithSteps extends Process {
  steps: ProcessStep[];
}

export interface ProcessQueryOptions {
  categories?: string[];
  statuses?: Process['status'][];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'instanceCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ProcessStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  avgStepCount: number;
  avgInstanceCount: number;
}

// Query keys
const QUERY_KEYS = {
  processes: (orgId: string, options?: ProcessQueryOptions) =>
    ['processes', orgId, options] as const,
  process: (orgId: string, processId: string) =>
    ['processes', orgId, processId] as const,
  processStats: (orgId: string) =>
    ['processes', orgId, 'stats'] as const,
};

// Process List Hook
export function useProcesses(organizationId: string, options: ProcessQueryOptions = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.processes(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.categories) params.set('categories', options.categories.join(','));
      if (options.statuses) params.set('statuses', options.statuses.join(','));
      if (options.search) params.set('search', options.search);
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);

      const response = await apiClient.get<{
        data: Process[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/discovery/processes?${params}`);
      return response;
    },
  });
}

// Single Process Hook
export function useProcess(organizationId: string, processId: string, includeSteps = false) {
  return useQuery({
    queryKey: QUERY_KEYS.process(organizationId, processId),
    queryFn: async () => {
      const params = includeSteps ? '?includeSteps=true' : '';
      const response = await apiClient.get<{ data: ProcessWithSteps }>(
        `/organizations/${organizationId}/discovery/processes/${processId}${params}`
      );
      return response.data;
    },
    enabled: !!processId,
  });
}

// Process Stats Hook
export function useProcessStats(organizationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.processStats(organizationId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: ProcessStats }>(
        `/organizations/${organizationId}/discovery/processes/stats`
      );
      return response.data;
    },
  });
}

// Update Process Mutation
export function useUpdateProcess(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      processId,
      ...input
    }: {
      processId: string;
      name?: string;
      description?: string;
      category?: string;
      status?: Process['status'];
      metadata?: Record<string, unknown>;
    }) => {
      const response = await apiClient.put<{ data: Process }>(
        `/organizations/${organizationId}/discovery/processes/${processId}`,
        input
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['processes', organizationId] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.process(organizationId, variables.processId),
      });
    },
  });
}

// Delete Process Mutation
export function useDeleteProcess(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (processId: string) => {
      await apiClient.delete(`/organizations/${organizationId}/discovery/processes/${processId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', organizationId] });
    },
  });
}

// Analyze Process Mutation (triggers re-analysis)
export function useAnalyzeProcess(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (processId: string) => {
      const response = await apiClient.post<{ data: { jobId: string } }>(
        `/organizations/${organizationId}/discovery/processes/${processId}/analyze`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes', organizationId] });
    },
  });
}

export default {
  useProcesses,
  useProcess,
  useProcessStats,
  useUpdateProcess,
  useDeleteProcess,
  useAnalyzeProcess,
};
