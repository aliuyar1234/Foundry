/**
 * Insights Hooks
 * TanStack Query hooks for insights and bus factor operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export type InsightType =
  | 'burnout_risk'
  | 'process_degradation'
  | 'team_conflict'
  | 'bus_factor_risk'
  | 'data_quality'
  | 'compliance_gap'
  | 'opportunity'
  | 'anomaly';

export type InsightCategory = 'people' | 'process' | 'risk' | 'opportunity';

export type InsightSeverity = 'low' | 'medium' | 'high' | 'critical';

export type InsightStatus = 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed';

export interface Insight {
  id: string;
  organizationId: string;
  type: InsightType;
  category: InsightCategory;
  severity: InsightSeverity;
  status: InsightStatus;
  title: string;
  description: string;
  score: number;
  entityType: string;
  entityId: string;
  entityName?: string;
  evidence: Record<string, unknown>;
  recommendedActions: string[];
  relatedInsights: string[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightSummary {
  total: number;
  byStatus: Record<InsightStatus, number>;
  bySeverity: Record<InsightSeverity, number>;
  byCategory: Record<InsightCategory, number>;
  byType: Record<InsightType, number>;
  urgentCount: number;
  resolvedThisWeek: number;
  newThisWeek: number;
}

export interface BusFactorScore {
  organizationScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  domainScores: DomainBusFactor[];
  singlePointsOfFailure: SinglePointOfFailure[];
  criticalDomainsCount: number;
  highRiskDomainsCount: number;
  recommendations: string[];
}

export interface DomainBusFactor {
  domain: string;
  busFactorScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  expertCount: number;
  primaryExpert: {
    personId: string;
    name: string;
    expertiseScore: number;
  };
  knowledgeConcentration: number;
}

export interface SinglePointOfFailure {
  personId: string;
  personName: string;
  email: string;
  domains: string[];
  riskScore: number;
  estimatedImpact: string;
}

export interface PersonKnowledge {
  personId: string;
  personName: string;
  email: string;
  domains: Array<{
    domain: string;
    expertiseScore: number;
    isOnlyExpert: boolean;
  }>;
  overallRiskScore: number;
  knowledgeTransferPriority: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskExposureReport {
  organizationId: string;
  totalRiskExposure: number;
  currency: string;
  byPerson: Array<{
    personId: string;
    personName: string;
    riskExposure: number;
    domains: string[];
  }>;
  byDomain: Array<{
    domain: string;
    riskExposure: number;
    experts: string[];
  }>;
  scenarios: Array<{
    scenario: string;
    probability: number;
    impact: number;
    expectedLoss: number;
  }>;
  mitigationRecommendations: string[];
}

export interface InsightQueryOptions {
  types?: InsightType[];
  categories?: InsightCategory[];
  severities?: InsightSeverity[];
  statuses?: InsightStatus[];
  entityTypes?: string[];
  entityId?: string;
  minScore?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// Query keys
export const insightsKeys = {
  all: ['insights'] as const,
  list: (filters?: InsightQueryOptions) => [...insightsKeys.all, 'list', filters] as const,
  detail: (id: string) => [...insightsKeys.all, id] as const,
  summary: () => [...insightsKeys.all, 'summary'] as const,
  urgent: () => [...insightsKeys.all, 'urgent'] as const,
  busFactor: () => [...insightsKeys.all, 'bus-factor'] as const,
  busFactorPerson: (personId: string) => [...insightsKeys.busFactor(), 'person', personId] as const,
  busFactorDomains: () => [...insightsKeys.busFactor(), 'domains'] as const,
  singlePointsOfFailure: () => [...insightsKeys.busFactor(), 'spof'] as const,
  riskExposure: () => [...insightsKeys.all, 'risk-exposure'] as const,
  riskExposurePerson: (personId: string) => [...insightsKeys.riskExposure(), 'person', personId] as const,
};

/**
 * Fetch insights with filtering
 */
export function useInsights(options?: InsightQueryOptions) {
  return useQuery({
    queryKey: insightsKeys.list(options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.types) params.append('types', options.types.join(','));
      if (options?.categories) params.append('categories', options.categories.join(','));
      if (options?.severities) params.append('severities', options.severities.join(','));
      if (options?.statuses) params.append('statuses', options.statuses.join(','));
      if (options?.entityTypes) params.append('entityTypes', options.entityTypes.join(','));
      if (options?.entityId) params.append('entityId', options.entityId);
      if (options?.minScore) params.append('minScore', String(options.minScore));
      if (options?.from) params.append('from', options.from);
      if (options?.to) params.append('to', options.to);
      if (options?.limit) params.append('limit', String(options.limit));
      if (options?.offset) params.append('offset', String(options.offset));

      const response = await apiClient.get<{ success: boolean; data: Insight[] }>(
        `/insights?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch insight summary
 */
export function useInsightSummary() {
  return useQuery({
    queryKey: insightsKeys.summary(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: InsightSummary }>(
        '/insights/summary'
      );
      return response.data;
    },
  });
}

/**
 * Fetch urgent insights
 */
export function useUrgentInsights(limit = 10) {
  return useQuery({
    queryKey: insightsKeys.urgent(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Insight[] }>(
        `/insights/urgent?limit=${limit}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch single insight
 */
export function useInsight(id: string) {
  return useQuery({
    queryKey: insightsKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Insight }>(
        `/insights/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Acknowledge an insight
 */
export function useAcknowledgeInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ success: boolean; data: Insight }>(
        `/insights/${id}/acknowledge`
      );
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: insightsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: insightsKeys.list() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.urgent() });
    },
  });
}

/**
 * Resolve an insight
 */
export function useResolveInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const response = await apiClient.post<{ success: boolean; data: Insight }>(
        `/insights/${id}/resolve`,
        { notes }
      );
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: insightsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: insightsKeys.list() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.urgent() });
    },
  });
}

/**
 * Dismiss an insight
 */
export function useDismissInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const response = await apiClient.post<{ success: boolean; data: Insight }>(
        `/insights/${id}/dismiss`,
        { reason }
      );
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: insightsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: insightsKeys.list() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: insightsKeys.urgent() });
    },
  });
}

/**
 * Fetch organization bus factor
 */
export function useBusFactor(options?: { lookbackDays?: number; includeTeamBreakdown?: boolean }) {
  return useQuery({
    queryKey: insightsKeys.busFactor(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.lookbackDays) params.append('lookbackDays', String(options.lookbackDays));
      if (options?.includeTeamBreakdown) params.append('includeTeamBreakdown', 'true');

      const response = await apiClient.get<{ success: boolean; data: BusFactorScore }>(
        `/insights/bus-factor?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch person knowledge profile
 */
export function usePersonKnowledge(personId: string, lookbackDays?: number) {
  return useQuery({
    queryKey: insightsKeys.busFactorPerson(personId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lookbackDays) params.append('lookbackDays', String(lookbackDays));

      const response = await apiClient.get<{ success: boolean; data: PersonKnowledge }>(
        `/insights/bus-factor/person/${personId}?${params.toString()}`
      );
      return response.data;
    },
    enabled: !!personId,
  });
}

/**
 * Fetch domain bus factors
 */
export function useDomainBusFactors(options?: { lookbackDays?: number }) {
  return useQuery({
    queryKey: insightsKeys.busFactorDomains(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.lookbackDays) params.append('lookbackDays', String(options.lookbackDays));

      const response = await apiClient.get<{
        success: boolean;
        data: {
          domains: DomainBusFactor[];
          criticalCount: number;
          highRiskCount: number;
        };
      }>(`/insights/bus-factor/domains?${params.toString()}`);
      return response.data;
    },
  });
}

/**
 * Fetch single points of failure
 */
export function useSinglePointsOfFailure(lookbackDays?: number) {
  return useQuery({
    queryKey: insightsKeys.singlePointsOfFailure(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lookbackDays) params.append('lookbackDays', String(lookbackDays));

      const response = await apiClient.get<{ success: boolean; data: SinglePointOfFailure[] }>(
        `/insights/bus-factor/single-points-of-failure?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch risk exposure report
 */
export function useRiskExposure(options?: {
  lookbackDays?: number;
  avgSalary?: number;
  hiringCost?: number;
  currency?: string;
}) {
  return useQuery({
    queryKey: insightsKeys.riskExposure(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.lookbackDays) params.append('lookbackDays', String(options.lookbackDays));
      if (options?.avgSalary) params.append('avgSalary', String(options.avgSalary));
      if (options?.hiringCost) params.append('hiringCost', String(options.hiringCost));
      if (options?.currency) params.append('currency', options.currency);

      const response = await apiClient.get<{ success: boolean; data: RiskExposureReport }>(
        `/insights/risk-exposure?${params.toString()}`
      );
      return response.data;
    },
  });
}
