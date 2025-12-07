/**
 * Discovery Hooks
 * TanStack Query hooks for process discovery operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface Process {
  id: string;
  name: string;
  description?: string;
  status: 'discovered' | 'validated' | 'documented';
  confidence: number;
  frequency: number;
  avgDuration?: number;
  owner?: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessStep {
  id: string;
  processId: string;
  name: string;
  activity: string;
  order: number;
  frequency: number;
  avgDuration?: number;
  participants: string[];
  isStartStep: boolean;
  isEndStep: boolean;
}

export interface ProcessFlow {
  steps: ProcessStep[];
  transitions: Array<{
    from: string;
    to: string;
    frequency: number;
  }>;
}

export interface Person {
  id: string;
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  communicationCount?: number;
  meetingCount?: number;
}

export interface Communication {
  fromEmail: string;
  toEmail: string;
  totalCount: number;
  emailCount: number;
  messageCount: number;
  callCount: number;
  lastCommunication: string;
  strength: number;
}

export interface DiscoveryOptions {
  sourceId?: string;
  eventTypes?: string[];
  from?: string;
  to?: string;
  minCaseCount?: number;
  minActivityFrequency?: number;
}

// Query keys
export const discoveryKeys = {
  all: ['discovery'] as const,
  processes: () => [...discoveryKeys.all, 'processes'] as const,
  processList: (filters?: Record<string, unknown>) =>
    [...discoveryKeys.processes(), 'list', filters] as const,
  processDetail: (id: string) => [...discoveryKeys.processes(), id] as const,
  processFlow: (id: string) => [...discoveryKeys.processDetail(id), 'flow'] as const,
  network: () => [...discoveryKeys.all, 'network'] as const,
  people: () => [...discoveryKeys.network(), 'people'] as const,
  communications: (email?: string) =>
    [...discoveryKeys.network(), 'communications', email] as const,
  hierarchy: () => [...discoveryKeys.network(), 'hierarchy'] as const,
};

/**
 * Fetch discovered processes
 */
export function useProcesses(options?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: discoveryKeys.processList(options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', String(options.limit));

      const response = await apiClient.get<{ success: boolean; data: Process[] }>(
        `/discovery/processes?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch a single process
 */
export function useProcess(id: string) {
  return useQuery({
    queryKey: discoveryKeys.processDetail(id),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: Process }>(
        `/discovery/processes/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch process flow (steps and transitions)
 */
export function useProcessFlow(processId: string) {
  return useQuery({
    queryKey: discoveryKeys.processFlow(processId),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: ProcessFlow }>(
        `/discovery/processes/${processId}/flow`
      );
      return response.data;
    },
    enabled: !!processId,
  });
}

/**
 * Trigger process discovery
 */
export function useDiscoverProcesses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: DiscoveryOptions) => {
      const response = await apiClient.post<{
        success: boolean;
        data: Array<{
          process: Process;
          stepCount: number;
          metrics: {
            totalCases: number;
            totalEvents: number;
            uniqueActivities: number;
            traceVariants: number;
            avgCaseDuration: number;
            throughput: number;
            bottleneckActivities: string[];
          } | null;
        }>;
      }>('/discovery/processes/discover', options);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.processes() });
    },
  });
}

/**
 * Update a process
 */
export function useUpdateProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Process, 'name' | 'description' | 'status' | 'owner' | 'department'>>;
    }) => {
      const response = await apiClient.patch<{ success: boolean; data: Process }>(
        `/discovery/processes/${id}`,
        updates
      );
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.processDetail(id) });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.processList() });
    },
  });
}

/**
 * Delete a process
 */
export function useDeleteProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/discovery/processes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.processes() });
    },
  });
}

/**
 * Fetch people in communication network
 */
export function usePeople(options?: { limit?: number }) {
  return useQuery({
    queryKey: discoveryKeys.people(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', String(options.limit));

      const response = await apiClient.get<{ success: boolean; data: Person[] }>(
        `/discovery/network/people?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch communication relationships
 */
export function useCommunications(options?: {
  email?: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  limit?: number;
}) {
  return useQuery({
    queryKey: discoveryKeys.communications(options?.email),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.email) params.append('email', options.email);
      if (options?.direction) params.append('direction', options.direction);
      if (options?.limit) params.append('limit', String(options.limit));

      const response = await apiClient.get<{ success: boolean; data: Communication[] }>(
        `/discovery/network/communications?${params.toString()}`
      );
      return response.data;
    },
  });
}

/**
 * Fetch organizational hierarchy
 */
export function useHierarchy(rootEmail?: string) {
  return useQuery({
    queryKey: discoveryKeys.hierarchy(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rootEmail) params.append('rootEmail', rootEmail);

      const response = await apiClient.get<{
        success: boolean;
        data: Array<{
          email: string;
          displayName?: string;
          managerEmail?: string;
          level: number;
        }>;
      }>(`/discovery/network/hierarchy?${params.toString()}`);
      return response.data;
    },
  });
}

// BPMN Export Types and Hooks

export type LayoutAlgorithm = 'horizontal' | 'vertical' | 'hierarchical';

export interface BpmnExportOptions {
  processIds?: string[];
  includeParticipants?: boolean;
  includeDiagram?: boolean;
  includeDocumentation?: boolean;
  layoutAlgorithm?: LayoutAlgorithm;
}

export interface BpmnExportResult {
  processId: string;
  processName: string;
  bpmnXml: string;
  elementCount: number;
  diagramIncluded: boolean;
  exportedAt: string;
}

export interface BpmnBulkExportResult {
  processCount: number;
  exports: Array<{
    processId: string;
    processName: string;
    elementCount: number;
    diagramIncluded: boolean;
    exportedAt: string;
  }>;
}

/**
 * Export processes to BPMN 2.0 format (bulk)
 */
export function useBpmnExport(organizationId: string) {
  return useMutation({
    mutationFn: async (options: BpmnExportOptions) => {
      const response = await apiClient.post<{
        success: boolean;
        data: BpmnBulkExportResult;
      }>('/discovery/export/bpmn', options);
      return response;
    },
  });
}

/**
 * Export a single process to BPMN and download
 */
export function useBpmnDownload(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      processId,
      includeParticipants = true,
      includeDiagram = true,
      includeDocumentation = true,
      layoutAlgorithm = 'horizontal',
    }: {
      processId: string;
      includeParticipants?: boolean;
      includeDiagram?: boolean;
      includeDocumentation?: boolean;
      layoutAlgorithm?: LayoutAlgorithm;
    }) => {
      const params = new URLSearchParams();
      params.append('includeParticipants', String(includeParticipants));
      params.append('includeDiagram', String(includeDiagram));
      params.append('layoutAlgorithm', layoutAlgorithm);

      const response = await apiClient.get<string>(
        `/discovery/export/bpmn/${processId}/download?${params.toString()}`,
        { responseType: 'text' }
      );

      // Trigger download
      const blob = new Blob([response], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `process_${processId}_${new Date().toISOString().split('T')[0]}.bpmn`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return response;
    },
  });
}

/**
 * Get BPMN export for a single process (without download)
 */
export function useBpmnProcess(
  processId: string,
  options?: {
    includeParticipants?: boolean;
    includeDiagram?: boolean;
    includeDocumentation?: boolean;
    layoutAlgorithm?: LayoutAlgorithm;
    format?: 'json' | 'xml';
  }
) {
  return useQuery({
    queryKey: ['discovery', 'bpmn', processId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.includeParticipants !== undefined)
        params.append('includeParticipants', String(options.includeParticipants));
      if (options?.includeDiagram !== undefined)
        params.append('includeDiagram', String(options.includeDiagram));
      if (options?.includeDocumentation !== undefined)
        params.append('includeDocumentation', String(options.includeDocumentation));
      if (options?.layoutAlgorithm)
        params.append('layoutAlgorithm', options.layoutAlgorithm);
      if (options?.format) params.append('format', options.format);

      const response = await apiClient.get<{
        success: boolean;
        data: BpmnExportResult;
      }>(`/discovery/export/bpmn/${processId}?${params.toString()}`);
      return response.data;
    },
    enabled: !!processId,
  });
}
