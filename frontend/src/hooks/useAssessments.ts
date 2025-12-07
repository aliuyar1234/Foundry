/**
 * Assessment Hooks
 * React Query hooks for assessment management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Types
export type AssessmentType = 'erp' | 'ai' | 'data_quality' | 'process_maturity' | 'comprehensive';
export type AssessmentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Assessment {
  id: string;
  organizationId: string;
  type: AssessmentType;
  name: string;
  status: AssessmentStatus;
  overallScore: number | null;
  results: unknown;
  recommendations: unknown;
  error: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AssessmentSummary {
  id: string;
  organizationId: string;
  type: AssessmentType;
  name: string;
  status: AssessmentStatus;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: string;
}

export interface AssessmentStatus {
  id: string;
  status: AssessmentStatus;
  overallScore: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  progress?: number;
}

export interface AssessmentQueryOptions {
  types?: AssessmentType[];
  statuses?: AssessmentStatus[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'completedAt' | 'overallScore';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateAssessmentInput {
  type: AssessmentType;
  name?: string;
  options?: {
    includeRecommendations?: boolean;
    detailLevel?: 'summary' | 'detailed' | 'comprehensive';
    focusAreas?: string[];
  };
}

export interface AssessmentSummaryStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  latestAssessments: AssessmentSummary[];
  averageScores: Record<string, number>;
}

export interface AssessmentComparison {
  assessments: Array<{
    id: string;
    name: string;
    type: AssessmentType;
    overallScore: number | null;
    completedAt: string | null;
  }>;
  scoreChange: number;
  trend: 'improving' | 'stable' | 'declining';
  timePeriod: {
    from: string | null;
    to: string | null;
  };
}

// Query keys
const QUERY_KEYS = {
  assessments: (orgId: string, options?: AssessmentQueryOptions) =>
    ['assessments', orgId, options] as const,
  assessment: (orgId: string, assessmentId: string) =>
    ['assessments', orgId, assessmentId] as const,
  assessmentStatus: (orgId: string, assessmentId: string) =>
    ['assessments', orgId, assessmentId, 'status'] as const,
  assessmentSummary: (orgId: string) =>
    ['assessments', orgId, 'summary'] as const,
};

// Assessment List Hook
export function useAssessments(organizationId: string, options: AssessmentQueryOptions = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.assessments(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.types) params.set('types', options.types.join(','));
      if (options.statuses) params.set('statuses', options.statuses.join(','));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);

      const response = await apiClient.get<{
        data: AssessmentSummary[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/assessments?${params}`);
      return response;
    },
  });
}

// Single Assessment Hook
export function useAssessment(organizationId: string, assessmentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.assessment(organizationId, assessmentId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: Assessment }>(
        `/organizations/${organizationId}/assessments/${assessmentId}`
      );
      return response.data;
    },
    enabled: !!assessmentId,
  });
}

// Assessment Status Hook (for polling during processing)
export function useAssessmentStatus(
  organizationId: string,
  assessmentId: string,
  pollInterval?: number
) {
  return useQuery({
    queryKey: QUERY_KEYS.assessmentStatus(organizationId, assessmentId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: AssessmentStatus }>(
        `/organizations/${organizationId}/assessments/${assessmentId}/status`
      );
      return response.data;
    },
    enabled: !!assessmentId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') {
        return pollInterval || 3000; // Poll every 3 seconds while processing
      }
      return false;
    },
  });
}

// Assessment Summary Hook
export function useAssessmentSummary(organizationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.assessmentSummary(organizationId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: AssessmentSummaryStats }>(
        `/organizations/${organizationId}/assessments/summary`
      );
      return response.data;
    },
  });
}

// Create Assessment Mutation
export function useCreateAssessment(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAssessmentInput) => {
      const response = await apiClient.post<{
        data: { id: string; status: string; message: string };
      }>(`/organizations/${organizationId}/assessments`, input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', organizationId] });
    },
  });
}

// Delete Assessment Mutation
export function useDeleteAssessment(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assessmentId: string) => {
      await apiClient.delete(`/organizations/${organizationId}/assessments/${assessmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', organizationId] });
    },
  });
}

// Export Assessment Mutation
export function useExportAssessment(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      assessmentId,
      format,
      includeRecommendations,
      includeDetails,
    }: {
      assessmentId: string;
      format: 'pdf' | 'docx' | 'json';
      includeRecommendations?: boolean;
      includeDetails?: boolean;
    }) => {
      const response = await apiClient.post(
        `/organizations/${organizationId}/assessments/${assessmentId}/export`,
        { format, includeRecommendations, includeDetails },
        { responseType: format !== 'json' ? 'blob' : undefined }
      );
      return response;
    },
  });
}

// Compare Assessments Hook
export function useCompareAssessments(organizationId: string, assessmentIds: string[]) {
  return useQuery({
    queryKey: ['assessments', organizationId, 'compare', assessmentIds],
    queryFn: async () => {
      const response = await apiClient.get<{ data: AssessmentComparison }>(
        `/organizations/${organizationId}/assessments/compare?ids=${assessmentIds.join(',')}`
      );
      return response.data;
    },
    enabled: assessmentIds.length >= 2,
  });
}

export default {
  useAssessments,
  useAssessment,
  useAssessmentStatus,
  useAssessmentSummary,
  useCreateAssessment,
  useDeleteAssessment,
  useExportAssessment,
  useCompareAssessments,
};
