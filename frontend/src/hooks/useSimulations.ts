/**
 * Simulation Hooks
 * React Query hooks for simulation management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Types
export type SimulationType = 'personnel' | 'process' | 'organization' | 'combined';
export type SimulationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Simulation {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: SimulationType;
  status: SimulationStatus;
  progress?: number;
  statusMessage?: string;
  overallScore: number | null;
  impactLevel: string | null;
  changes: Record<string, unknown>;
  options: Record<string, unknown>;
  results: SimulationResults | null;
  error: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SimulationSummary {
  id: string;
  name: string;
  description?: string;
  type: SimulationType;
  status: SimulationStatus;
  overallScore: number | null;
  impactLevel: string | null;
  createdAt: string;
  completedAt: string | null;
  createdBy: string;
}

export interface SimulationResults {
  impacts?: unknown;
  quantified?: QuantifiedImpact;
  mitigation?: MitigationPlan;
}

export interface QuantifiedImpact {
  summary: {
    overallScore: number;
    impactLevel: string;
    netBenefit: boolean;
    confidenceLevel: number;
    keyTakeaway: string;
  };
  financial: {
    oneTimeCosts: {
      total: number;
    };
    netFinancialImpact: {
      yearOne: number;
      fiveYear: number;
    };
    roi: {
      simple: number;
      paybackMonths: number;
      npv: number;
    };
    currency: string;
  };
  operational: {
    productivity: {
      shortTermChange: number;
      longTermChange: number;
      transitionPeriod: number;
    };
  };
  risk: {
    overallRiskScore: number;
    topRisks: Array<{
      risk: string;
      category: string;
      score: number;
      mitigation: string;
    }>;
  };
  timeline: {
    totalDuration: number;
    phases: Array<{
      name: string;
      duration: number;
    }>;
  };
  recommendations: Array<{
    priority: string;
    category: string;
    recommendation: string;
    rationale: string;
    actions: string[];
  }>;
}

export interface MitigationPlan {
  overallStrategy: {
    approach: string;
    rationale: string;
    keyPrinciples: string[];
    estimatedCost: number;
  };
  riskMitigations: Array<{
    riskId: string;
    riskDescription: string;
    severity: string;
    currentScore: number;
    targetScore: number;
    strategies: Array<{
      strategy: string;
      type: string;
      effectiveness: number;
      cost: number;
    }>;
  }>;
  timeline: {
    totalDuration: number;
    phases: Array<{
      name: string;
      duration: number;
      activities: string[];
    }>;
  };
}

export interface PersonnelChange {
  type: 'departure' | 'absence' | 'role_change' | 'team_transfer';
  personId: string;
  targetRoleId?: string;
  targetTeamId?: string;
  startDate?: string;
  endDate?: string;
  probability?: number;
}

export interface ProcessChange {
  type: 'modification' | 'elimination' | 'automation' | 'merger' | 'split';
  processId: string;
  targetProcessId?: string;
  automationLevel?: number;
  modifications?: {
    addSteps?: Array<{ name: string; duration?: number }>;
    removeSteps?: string[];
  };
}

export interface OrgStructureChange {
  type: 'team_merge' | 'team_split' | 'reporting_change' | 'department_restructure' | 'role_consolidation';
  sourceTeamId?: string;
  targetTeamId?: string;
  affectedPersonIds?: string[];
  newManagerId?: string;
}

export interface CreateSimulationInput {
  name: string;
  description?: string;
  type: SimulationType;
  changes: {
    personnel?: PersonnelChange[];
    process?: ProcessChange[];
    organization?: OrgStructureChange[];
  };
  options?: {
    includeMitigation?: boolean;
    includeFinancials?: boolean;
    scenario?: 'optimistic' | 'realistic' | 'pessimistic';
  };
  runAsync?: boolean;
}

export interface SimulationQueryOptions {
  types?: SimulationType[];
  statuses?: SimulationStatus[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'completedAt' | 'overallScore';
  sortOrder?: 'asc' | 'desc';
}

// Query keys
const QUERY_KEYS = {
  simulations: (orgId: string, options?: SimulationQueryOptions) =>
    ['simulations', orgId, options] as const,
  simulation: (orgId: string, simulationId: string) =>
    ['simulations', orgId, simulationId] as const,
  simulationStatus: (orgId: string, simulationId: string) =>
    ['simulations', orgId, simulationId, 'status'] as const,
  simulationResults: (orgId: string, simulationId: string) =>
    ['simulations', orgId, simulationId, 'results'] as const,
};

// Simulation List Hook
export function useSimulations(organizationId: string, options: SimulationQueryOptions = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.simulations(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.types) params.set('types', options.types.join(','));
      if (options.statuses) params.set('statuses', options.statuses.join(','));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);

      const response = await apiClient.get<{
        data: SimulationSummary[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/simulation?${params}`);
      return response;
    },
  });
}

// Single Simulation Hook
export function useSimulation(organizationId: string, simulationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.simulation(organizationId, simulationId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: Simulation }>(
        `/organizations/${organizationId}/simulation/${simulationId}/results`
      );
      return response.data;
    },
    enabled: !!simulationId,
  });
}

// Simulation Status Hook (for polling during processing)
export function useSimulationStatus(
  organizationId: string,
  simulationId: string,
  pollInterval?: number
) {
  return useQuery({
    queryKey: QUERY_KEYS.simulationStatus(organizationId, simulationId),
    queryFn: async () => {
      const response = await apiClient.get<{
        data: {
          id: string;
          status: SimulationStatus;
          progress: number;
          statusMessage?: string;
          overallScore: number | null;
          impactLevel: string | null;
          completedAt: string | null;
          error: string | null;
        };
      }>(`/organizations/${organizationId}/simulation/${simulationId}/status`);
      return response.data;
    },
    enabled: !!simulationId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') {
        return pollInterval || 3000;
      }
      return false;
    },
  });
}

// Create Personnel Simulation Mutation
export function useCreatePersonnelSimulation(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSimulationInput) => {
      const response = await apiClient.post<{
        data: { id: string; status: string; message?: string; summary?: unknown };
      }>(`/organizations/${organizationId}/simulation/personnel`, input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', organizationId] });
    },
  });
}

// Create Process Simulation Mutation
export function useCreateProcessSimulation(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSimulationInput) => {
      const response = await apiClient.post<{
        data: { id: string; status: string; message?: string; summary?: unknown };
      }>(`/organizations/${organizationId}/simulation/process`, input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', organizationId] });
    },
  });
}

// Create Organization Simulation Mutation
export function useCreateOrgSimulation(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSimulationInput) => {
      const response = await apiClient.post<{
        data: { id: string; status: string; message?: string; summary?: unknown };
      }>(`/organizations/${organizationId}/simulation/organization`, input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', organizationId] });
    },
  });
}

// Delete Simulation Mutation
export function useDeleteSimulation(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (simulationId: string) => {
      await apiClient.delete(`/organizations/${organizationId}/simulation/${simulationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', organizationId] });
    },
  });
}

// Export Simulation Mutation
export function useExportSimulation(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      simulationId,
      format,
    }: {
      simulationId: string;
      format: 'pdf' | 'docx' | 'json';
    }) => {
      const response = await apiClient.post(
        `/organizations/${organizationId}/simulation/${simulationId}/export`,
        { format }
      );
      return response;
    },
  });
}

export default {
  useSimulations,
  useSimulation,
  useSimulationStatus,
  useCreatePersonnelSimulation,
  useCreateProcessSimulation,
  useCreateOrgSimulation,
  useDeleteSimulation,
  useExportSimulation,
};
