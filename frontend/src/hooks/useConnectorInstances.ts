/**
 * Connector Instances Hook (T201)
 * TanStack Query hooks for connector instance CRUD operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';
import { queryKeys } from '../lib/queryClient';

// Type Definitions
export type ConnectorType =
  | 'M365'
  | 'GOOGLE_WORKSPACE'
  | 'ODOO'
  | 'SAP_B1'
  | 'DYNAMICS'
  | 'HUBSPOT'
  | 'SALESFORCE'
  | 'SLACK'
  | 'DATEV'
  | 'BMD'
  | 'CUSTOM';

export type ConnectorStatus =
  | 'PENDING'
  | 'CONNECTED'
  | 'ERROR'
  | 'DISABLED';

export type SyncStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED';

export interface ConnectorInstance {
  id: string;
  type: ConnectorType;
  name: string;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  syncSchedule?: string;
  lastSyncAt?: string;
  lastSyncStatus?: SyncStatus;
  deltaToken?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
}

export interface ConnectorMetadata {
  type: ConnectorType;
  name: string;
  description: string;
  icon?: string;
  capabilities: {
    supportsIncrementalSync: boolean;
    supportsWebhooks: boolean;
    supportedResources: string[];
    requiredConfig: string[];
    optionalConfig: string[];
  };
}

export interface CreateConnectorInput {
  name: string;
  type: ConnectorType;
  config?: Record<string, unknown>;
  syncSchedule?: string;
}

export interface UpdateConnectorInput {
  name?: string;
  config?: Record<string, unknown>;
  syncSchedule?: string;
  status?: ConnectorStatus;
}

export interface ConnectorValidationResult {
  valid: boolean;
  errors?: string[];
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
 * Fetch all available connector types
 */
export function useAvailableConnectors() {
  return useQuery({
    queryKey: ['connectors', 'available'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ConnectorMetadata[]>>(
        '/connectors/available'
      );
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - rarely changes
  });
}

/**
 * Fetch all connector instances for an organization
 */
export function useConnectorInstances(organizationId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<ConnectorInstance>>(
        `/organizations/${organizationId}/connectors`
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
}

/**
 * Fetch a single connector instance
 */
export function useConnectorInstance(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ConnectorInstance>>(
        `/organizations/${organizationId}/connectors/${instanceId}`
      );
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
  });
}

/**
 * Create a new connector instance with optimistic updates
 */
export function useCreateConnectorInstance(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateConnectorInput) => {
      const response = await apiClient.post<ApiResponse<ConnectorInstance>>(
        `/organizations/${organizationId}/connectors`,
        input
      );
      return response.data;
    },
    onMutate: async (newConnector) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['connectors', 'instances', organizationId],
      });

      // Snapshot previous value
      const previousConnectors = queryClient.getQueryData<ConnectorInstance[]>([
        'connectors',
        'instances',
        organizationId,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<ConnectorInstance[]>(
        ['connectors', 'instances', organizationId],
        (old = []) => [
          ...old,
          {
            id: 'temp-' + Date.now(),
            ...newConnector,
            status: 'PENDING' as ConnectorStatus,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            organizationId,
          } as ConnectorInstance,
        ]
      );

      return { previousConnectors };
    },
    onError: (err, newConnector, context) => {
      // Rollback on error
      if (context?.previousConnectors) {
        queryClient.setQueryData(
          ['connectors', 'instances', organizationId],
          context.previousConnectors
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId],
      });
    },
  });
}

/**
 * Update a connector instance with optimistic updates
 */
export function useUpdateConnectorInstance(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateConnectorInput) => {
      const response = await apiClient.patch<ApiResponse<ConnectorInstance>>(
        `/organizations/${organizationId}/connectors/${instanceId}`,
        input
      );
      return response.data;
    },
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId],
      });

      // Snapshot previous value
      const previousInstance = queryClient.getQueryData<ConnectorInstance>([
        'connectors',
        'instances',
        organizationId,
        instanceId,
      ]);

      // Optimistically update to the new value
      if (previousInstance) {
        queryClient.setQueryData<ConnectorInstance>(
          ['connectors', 'instances', organizationId, instanceId],
          {
            ...previousInstance,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        );
      }

      return { previousInstance };
    },
    onError: (err, updates, context) => {
      // Rollback on error
      if (context?.previousInstance) {
        queryClient.setQueryData(
          ['connectors', 'instances', organizationId, instanceId],
          context.previousInstance
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId],
      });
    },
  });
}

/**
 * Delete a connector instance with optimistic updates
 */
export function useDeleteConnectorInstance(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      await apiClient.delete(
        `/organizations/${organizationId}/connectors/${instanceId}`
      );
    },
    onMutate: async (instanceId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['connectors', 'instances', organizationId],
      });

      // Snapshot previous value
      const previousConnectors = queryClient.getQueryData<ConnectorInstance[]>([
        'connectors',
        'instances',
        organizationId,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<ConnectorInstance[]>(
        ['connectors', 'instances', organizationId],
        (old = []) => old.filter((c) => c.id !== instanceId)
      );

      return { previousConnectors };
    },
    onError: (err, instanceId, context) => {
      // Rollback on error
      if (context?.previousConnectors) {
        queryClient.setQueryData(
          ['connectors', 'instances', organizationId],
          context.previousConnectors
        );
      }
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId],
      });
    },
  });
}

/**
 * Test connector connection
 */
export function useTestConnectorConnection(organizationId: string, instanceId: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<
        ApiResponse<{ success: boolean; error?: string }>
      >(`/organizations/${organizationId}/connectors/${instanceId}/test`);
      return response.data;
    },
  });
}

/**
 * Validate connector configuration
 */
export function useValidateConnectorConfig(connectorType: ConnectorType) {
  return useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      const response = await apiClient.post<ApiResponse<ConnectorValidationResult>>(
        `/connectors/validate/${connectorType}`,
        { config }
      );
      return response.data;
    },
  });
}

/**
 * Get OAuth authorization URL
 */
export function useGetConnectorAuthUrl(organizationId: string, instanceId: string) {
  return useMutation({
    mutationFn: async ({ redirectUri }: { redirectUri: string }) => {
      const response = await apiClient.post<
        ApiResponse<{ authorizationUrl: string; state: string }>
      >(`/organizations/${organizationId}/connectors/${instanceId}/auth/url`, {
        redirectUri,
      });
      return response.data;
    },
  });
}

/**
 * Exchange OAuth code for tokens
 */
export function useExchangeConnectorAuthCode(organizationId: string, instanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      code,
      redirectUri,
      state,
    }: {
      code: string;
      redirectUri: string;
      state: string;
    }) => {
      const response = await apiClient.post<ApiResponse<{ success: boolean }>>(
        `/organizations/${organizationId}/connectors/${instanceId}/auth/callback`,
        { code, redirectUri, state }
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate connector instance to reflect auth status
      queryClient.invalidateQueries({
        queryKey: ['connectors', 'instances', organizationId, instanceId],
      });
    },
  });
}

/**
 * Get connector health status
 */
export function useConnectorHealth(organizationId: string, instanceId: string) {
  return useQuery({
    queryKey: ['connectors', 'instances', organizationId, instanceId, 'health'],
    queryFn: async () => {
      const response = await apiClient.get<
        ApiResponse<{
          healthy: boolean;
          status: 'connected' | 'degraded' | 'disconnected' | 'error';
          latencyMs?: number;
          lastSuccessfulSync?: string;
          error?: string;
          details?: Record<string, unknown>;
        }>
      >(`/organizations/${organizationId}/connectors/${instanceId}/health`);
      return response.data;
    },
    enabled: !!organizationId && !!instanceId,
    refetchInterval: 60000, // Refetch every minute
  });
}
