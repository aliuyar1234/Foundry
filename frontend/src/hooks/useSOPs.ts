/**
 * SOP Hooks
 * React Query hooks for SOP management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Types
export type SOPStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export interface SOP {
  id: string;
  organizationId: string;
  processId: string;
  title: string;
  content: string;
  version: string;
  language: string;
  status: SOPStatus;
  confidence?: number;
  generatedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  process?: {
    id: string;
    name: string;
  };
}

export interface SOPVersion {
  id: string;
  sopId: string;
  version: string;
  content: string;
  createdBy: string;
  changeNotes?: string;
  createdAt: string;
}

export interface SOPWithVersions extends SOP {
  versions: SOPVersion[];
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  diffHtml: string;
  diffText: string;
}

export interface VersionChange {
  type: 'add' | 'remove' | 'modify';
  lineNumber?: number;
  section?: string;
  oldContent?: string;
  newContent?: string;
}

export interface DeviationReport {
  sopId: string;
  sopTitle: string;
  processId: string;
  processName: string;
  analyzedAt: string;
  deviations: Deviation[];
  summary: {
    totalDeviations: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    criticalDeviations: number;
  };
  recommendations: string[];
  complianceScore: number;
}

export interface Deviation {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  frequency: number;
  impact: string;
  suggestedAction?: string;
}

export interface SOPGenerationOptions {
  language: 'en' | 'de';
  style: 'formal' | 'conversational';
  detailLevel: 'brief' | 'standard' | 'detailed';
  includeFlowchart?: boolean;
  includeCheckboxes?: boolean;
  includeTimelines?: boolean;
  targetAudience?: string;
  companyName?: string;
  department?: string;
}

export interface SOPQueryOptions {
  processIds?: string[];
  statuses?: SOPStatus[];
  languages?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SOPStats {
  total: number;
  byStatus: Record<string, number>;
  byLanguage: Record<string, number>;
  avgConfidence: number;
  recentlyUpdated: number;
}

// Query keys
const QUERY_KEYS = {
  sops: (orgId: string, options?: SOPQueryOptions) =>
    ['sops', orgId, options] as const,
  sop: (orgId: string, sopId: string) =>
    ['sops', orgId, sopId] as const,
  sopVersions: (orgId: string, sopId: string) =>
    ['sops', orgId, sopId, 'versions'] as const,
  sopStats: (orgId: string) =>
    ['sops', orgId, 'stats'] as const,
};

// SOP List Hook
export function useSOPs(organizationId: string, options: SOPQueryOptions = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.sops(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.processIds) params.set('processIds', options.processIds.join(','));
      if (options.statuses) params.set('statuses', options.statuses.join(','));
      if (options.languages) params.set('languages', options.languages.join(','));
      if (options.search) params.set('search', options.search);
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);

      const response = await apiClient.get<{
        data: SOP[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/sops?${params}`);
      return response;
    },
  });
}

// Single SOP Hook
export function useSOP(organizationId: string, sopId: string, includeVersions = false) {
  return useQuery({
    queryKey: QUERY_KEYS.sop(organizationId, sopId),
    queryFn: async () => {
      const params = includeVersions ? '?includeVersions=true' : '';
      const response = await apiClient.get<{ data: SOPWithVersions }>(
        `/organizations/${organizationId}/sops/${sopId}${params}`
      );
      return response.data;
    },
    enabled: !!sopId,
  });
}

// SOP Stats Hook
export function useSOPStats(organizationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sopStats(organizationId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: SOPStats }>(
        `/organizations/${organizationId}/sops/stats`
      );
      return response.data;
    },
  });
}

// SOP Versions Hook
export function useSOPVersions(organizationId: string, sopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sopVersions(organizationId, sopId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: SOPVersion[] }>(
        `/organizations/${organizationId}/sops/${sopId}/versions`
      );
      return response.data;
    },
    enabled: !!sopId,
  });
}

// Generate SOP Mutation
export function useGenerateSOP(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      processId,
      options,
    }: {
      processId: string;
      options?: Partial<SOPGenerationOptions>;
    }) => {
      const response = await apiClient.post<{
        data: { jobId: string; status: string; message: string };
      }>(`/organizations/${organizationId}/sops/generate`, {
        processId,
        options,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
    },
  });
}

// Create SOP Mutation
export function useCreateSOP(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      processId: string;
      title: string;
      content: string;
      language?: string;
      status?: SOPStatus;
      metadata?: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ data: SOP }>(
        `/organizations/${organizationId}/sops`,
        input
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
    },
  });
}

// Update SOP Mutation
export function useUpdateSOP(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sopId,
      ...input
    }: {
      sopId: string;
      title?: string;
      content?: string;
      status?: SOPStatus;
      metadata?: Record<string, unknown>;
      changeNotes?: string;
    }) => {
      const response = await apiClient.put<{ data: SOP }>(
        `/organizations/${organizationId}/sops/${sopId}`,
        input
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.sop(organizationId, variables.sopId),
      });
    },
  });
}

// Delete SOP Mutation
export function useDeleteSOP(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sopId: string) => {
      await apiClient.delete(`/organizations/${organizationId}/sops/${sopId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
    },
  });
}

// Update Status Mutation
export function useUpdateSOPStatus(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sopId, status }: { sopId: string; status: SOPStatus }) => {
      const response = await apiClient.patch<{ data: SOP }>(
        `/organizations/${organizationId}/sops/${sopId}/status`,
        { status }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.sop(organizationId, variables.sopId),
      });
    },
  });
}

// Restore Version Mutation
export function useRestoreSOPVersion(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sopId, versionId }: { sopId: string; versionId: string }) => {
      const response = await apiClient.post<{ data: SOP }>(
        `/organizations/${organizationId}/sops/${sopId}/versions/${versionId}/restore`
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sops', organizationId] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.sop(organizationId, variables.sopId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.sopVersions(organizationId, variables.sopId),
      });
    },
  });
}

// Compare Versions Hook
export function useCompareVersions(
  organizationId: string,
  sopId: string,
  fromVersionId: string,
  toVersionId: string
) {
  return useQuery({
    queryKey: ['sops', organizationId, sopId, 'compare', fromVersionId, toVersionId],
    queryFn: async () => {
      const response = await apiClient.get<{ data: VersionComparison }>(
        `/organizations/${organizationId}/sops/${sopId}/versions/compare?from=${fromVersionId}&to=${toVersionId}`
      );
      return response.data;
    },
    enabled: !!sopId && !!fromVersionId && !!toVersionId,
  });
}

// Export SOP Mutation
export function useExportSOP(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      sopId,
      format,
      includeMetadata,
      includeVersionHistory,
    }: {
      sopId: string;
      format: 'pdf' | 'docx' | 'markdown';
      includeMetadata?: boolean;
      includeVersionHistory?: boolean;
    }) => {
      const response = await apiClient.post(
        `/organizations/${organizationId}/sops/${sopId}/export`,
        { format, includeMetadata, includeVersionHistory },
        { responseType: 'blob' }
      );
      return response;
    },
  });
}

// Detect Deviations Mutation
export function useDetectDeviations(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      sopId,
      processData,
    }: {
      sopId: string;
      processData: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ data: DeviationReport }>(
        `/organizations/${organizationId}/sops/${sopId}/deviations`,
        { processData }
      );
      return response.data;
    },
  });
}
