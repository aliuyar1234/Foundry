/**
 * TanStack Query Client Configuration
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && 'status' in error) {
          const status = (error as Error & { status: number }).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Query key factory for type-safe query keys
export const queryKeys = {
  all: ['all'] as const,

  // Organizations
  organizations: () => [...queryKeys.all, 'organizations'] as const,
  organization: (id: string) => [...queryKeys.organizations(), id] as const,
  organizationStats: (id: string) => [...queryKeys.organization(id), 'stats'] as const,

  // Data Sources
  dataSources: (orgId: string) => [...queryKeys.organization(orgId), 'dataSources'] as const,
  dataSource: (orgId: string, id: string) => [...queryKeys.dataSources(orgId), id] as const,
  dataSourceJobs: (orgId: string, id: string) =>
    [...queryKeys.dataSource(orgId, id), 'jobs'] as const,

  // Discovery
  discovery: (orgId: string) => [...queryKeys.organization(orgId), 'discovery'] as const,
  processes: (orgId: string) => [...queryKeys.discovery(orgId), 'processes'] as const,
  process: (orgId: string, id: string) => [...queryKeys.processes(orgId), id] as const,
  processVariants: (orgId: string, id: string) =>
    [...queryKeys.process(orgId, id), 'variants'] as const,
  network: (orgId: string) => [...queryKeys.discovery(orgId), 'network'] as const,
  insights: (orgId: string) => [...queryKeys.discovery(orgId), 'insights'] as const,
  busFactor: (orgId: string) => [...queryKeys.discovery(orgId), 'busFactor'] as const,

  // Assessments
  assessments: (orgId: string) => [...queryKeys.organization(orgId), 'assessments'] as const,
  assessment: (orgId: string, id: string) => [...queryKeys.assessments(orgId), id] as const,

  // SOPs
  sops: (orgId: string) => [...queryKeys.organization(orgId), 'sops'] as const,
  sop: (orgId: string, id: string) => [...queryKeys.sops(orgId), id] as const,

  // Entity Records
  entityRecords: (orgId: string) => [...queryKeys.organization(orgId), 'entityRecords'] as const,
  entityRecord: (orgId: string, id: string) => [...queryKeys.entityRecords(orgId), id] as const,
  duplicates: (orgId: string) => [...queryKeys.organization(orgId), 'duplicates'] as const,

  // Simulation
  simulations: (orgId: string) => [...queryKeys.organization(orgId), 'simulations'] as const,
  simulation: (orgId: string, id: string) => [...queryKeys.simulations(orgId), id] as const,

  // Users
  users: (orgId: string) => [...queryKeys.organization(orgId), 'users'] as const,
  user: (id: string) => [...queryKeys.all, 'users', id] as const,
  currentUser: () => [...queryKeys.all, 'currentUser'] as const,

  // Connectors
  connectors: (orgId: string) => [...queryKeys.organization(orgId), 'connectors'] as const,
  connector: (orgId: string, id: string) => [...queryKeys.connectors(orgId), id] as const,
  connectorSyncJobs: (orgId: string, id: string) =>
    [...queryKeys.connector(orgId, id), 'syncJobs'] as const,
  connectorSyncJob: (orgId: string, connectorId: string, jobId: string) =>
    [...queryKeys.connectorSyncJobs(orgId, connectorId), jobId] as const,
  connectorErrors: (orgId: string, id: string) =>
    [...queryKeys.connector(orgId, id), 'errors'] as const,
  connectorError: (orgId: string, connectorId: string, errorId: string) =>
    [...queryKeys.connectorErrors(orgId, connectorId), errorId] as const,
  connectorHealth: (orgId: string, id: string) =>
    [...queryKeys.connector(orgId, id), 'health'] as const,
  connectorStats: (orgId: string, id: string) =>
    [...queryKeys.connector(orgId, id), 'stats'] as const,
  availableConnectors: () => [...queryKeys.all, 'connectors', 'available'] as const,
};
