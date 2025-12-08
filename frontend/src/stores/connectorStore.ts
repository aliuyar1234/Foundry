/**
 * Connector Store (T204)
 * Zustand store for global connector state management
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  ConnectorInstance,
  ConnectorMetadata,
  ConnectorType,
} from '../hooks/useConnectorInstances';
import type { SyncJob, SyncProgress } from '../hooks/useConnectorSync';

// Store State Types
interface ConnectorFilters {
  status?: string[];
  type?: ConnectorType[];
  searchQuery?: string;
}

interface ActiveSync {
  instanceId: string;
  jobId: string;
  progress?: SyncProgress;
  startedAt: string;
}

interface ConnectorState {
  // Available connector types cache
  availableConnectors: ConnectorMetadata[];
  setAvailableConnectors: (connectors: ConnectorMetadata[]) => void;

  // Instance list cache (per organization)
  instancesByOrg: Record<string, ConnectorInstance[]>;
  setInstancesForOrg: (orgId: string, instances: ConnectorInstance[]) => void;
  addInstance: (orgId: string, instance: ConnectorInstance) => void;
  updateInstance: (orgId: string, instanceId: string, updates: Partial<ConnectorInstance>) => void;
  removeInstance: (orgId: string, instanceId: string) => void;
  clearInstancesForOrg: (orgId: string) => void;

  // Active sync tracking
  activeSyncs: Record<string, ActiveSync>;
  startSync: (instanceId: string, jobId: string) => void;
  updateSyncProgress: (instanceId: string, progress: SyncProgress) => void;
  completeSync: (instanceId: string) => void;
  cancelSync: (instanceId: string) => void;
  getActiveSync: (instanceId: string) => ActiveSync | undefined;
  hasActiveSync: (instanceId: string) => boolean;
  getAllActiveSyncs: () => ActiveSync[];

  // UI State
  filters: ConnectorFilters;
  setFilters: (filters: ConnectorFilters) => void;
  resetFilters: () => void;

  selectedInstanceId: string | null;
  setSelectedInstanceId: (instanceId: string | null) => void;

  // Wizard state
  isWizardOpen: boolean;
  wizardConnectorType: ConnectorType | null;
  openWizard: (type?: ConnectorType) => void;
  closeWizard: () => void;

  // Error tracking
  lastError: { instanceId: string; message: string; timestamp: string } | null;
  setLastError: (instanceId: string, message: string) => void;
  clearLastError: () => void;

  // Sync notification preferences
  syncNotificationsEnabled: boolean;
  setSyncNotificationsEnabled: (enabled: boolean) => void;

  // Recent activity
  recentActivity: Array<{
    type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'instance_created' | 'instance_deleted';
    instanceId: string;
    instanceName?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
  addActivity: (activity: {
    type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'instance_created' | 'instance_deleted';
    instanceId: string;
    instanceName?: string;
    metadata?: Record<string, unknown>;
  }) => void;
  clearActivity: () => void;

  // Utilities
  reset: () => void;
}

const initialFilters: ConnectorFilters = {
  status: undefined,
  type: undefined,
  searchQuery: undefined,
};

const initialState = {
  availableConnectors: [],
  instancesByOrg: {},
  activeSyncs: {},
  filters: initialFilters,
  selectedInstanceId: null,
  isWizardOpen: false,
  wizardConnectorType: null,
  lastError: null,
  syncNotificationsEnabled: true,
  recentActivity: [],
};

export const useConnectorStore = create<ConnectorState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        // Available connectors
        setAvailableConnectors: (connectors) => set({ availableConnectors: connectors }),

        // Instance management
        setInstancesForOrg: (orgId, instances) =>
          set((state) => ({
            instancesByOrg: {
              ...state.instancesByOrg,
              [orgId]: instances,
            },
          })),

        addInstance: (orgId, instance) =>
          set((state) => {
            const existing = state.instancesByOrg[orgId] || [];
            return {
              instancesByOrg: {
                ...state.instancesByOrg,
                [orgId]: [...existing, instance],
              },
            };
          }),

        updateInstance: (orgId, instanceId, updates) =>
          set((state) => {
            const instances = state.instancesByOrg[orgId] || [];
            return {
              instancesByOrg: {
                ...state.instancesByOrg,
                [orgId]: instances.map((inst) =>
                  inst.id === instanceId ? { ...inst, ...updates } : inst
                ),
              },
            };
          }),

        removeInstance: (orgId, instanceId) =>
          set((state) => {
            const instances = state.instancesByOrg[orgId] || [];
            return {
              instancesByOrg: {
                ...state.instancesByOrg,
                [orgId]: instances.filter((inst) => inst.id !== instanceId),
              },
            };
          }),

        clearInstancesForOrg: (orgId) =>
          set((state) => {
            const { [orgId]: _, ...rest } = state.instancesByOrg;
            return { instancesByOrg: rest };
          }),

        // Active sync tracking
        startSync: (instanceId, jobId) =>
          set((state) => ({
            activeSyncs: {
              ...state.activeSyncs,
              [instanceId]: {
                instanceId,
                jobId,
                startedAt: new Date().toISOString(),
              },
            },
          })),

        updateSyncProgress: (instanceId, progress) =>
          set((state) => {
            const activeSync = state.activeSyncs[instanceId];
            if (!activeSync) return state;

            return {
              activeSyncs: {
                ...state.activeSyncs,
                [instanceId]: {
                  ...activeSync,
                  progress,
                },
              },
            };
          }),

        completeSync: (instanceId) =>
          set((state) => {
            const { [instanceId]: _, ...rest } = state.activeSyncs;
            return { activeSyncs: rest };
          }),

        cancelSync: (instanceId) =>
          set((state) => {
            const { [instanceId]: _, ...rest } = state.activeSyncs;
            return { activeSyncs: rest };
          }),

        getActiveSync: (instanceId) => get().activeSyncs[instanceId],

        hasActiveSync: (instanceId) => !!get().activeSyncs[instanceId],

        getAllActiveSyncs: () => Object.values(get().activeSyncs),

        // Filters
        setFilters: (filters) => set({ filters }),

        resetFilters: () => set({ filters: initialFilters }),

        // Selection
        setSelectedInstanceId: (instanceId) => set({ selectedInstanceId: instanceId }),

        // Wizard
        openWizard: (type) =>
          set({
            isWizardOpen: true,
            wizardConnectorType: type || null,
          }),

        closeWizard: () =>
          set({
            isWizardOpen: false,
            wizardConnectorType: null,
          }),

        // Error tracking
        setLastError: (instanceId, message) =>
          set({
            lastError: {
              instanceId,
              message,
              timestamp: new Date().toISOString(),
            },
          }),

        clearLastError: () => set({ lastError: null }),

        // Sync notifications
        setSyncNotificationsEnabled: (enabled) =>
          set({ syncNotificationsEnabled: enabled }),

        // Recent activity
        addActivity: (activity) =>
          set((state) => ({
            recentActivity: [
              {
                ...activity,
                timestamp: new Date().toISOString(),
              },
              ...state.recentActivity,
            ].slice(0, 50), // Keep last 50 activities
          })),

        clearActivity: () => set({ recentActivity: [] }),

        // Reset
        reset: () => set(initialState),
      }),
      {
        name: 'connector-storage',
        // Only persist UI preferences, not transient data
        partialize: (state) => ({
          filters: state.filters,
          syncNotificationsEnabled: state.syncNotificationsEnabled,
        }),
      }
    )
  )
);

// Selector hooks for performance
export const useAvailableConnectors = () =>
  useConnectorStore((state) => state.availableConnectors);

export const useInstancesForOrg = (orgId: string) =>
  useConnectorStore((state) => state.instancesByOrg[orgId] || []);

export const useActiveSyncs = () =>
  useConnectorStore((state) => state.getAllActiveSyncs());

export const useHasActiveSync = (instanceId: string) =>
  useConnectorStore((state) => state.hasActiveSync(instanceId));

export const useConnectorFilters = () =>
  useConnectorStore((state) => state.filters);

export const useSelectedInstanceId = () =>
  useConnectorStore((state) => state.selectedInstanceId);

export const useWizardState = () =>
  useConnectorStore((state) => ({
    isOpen: state.isWizardOpen,
    connectorType: state.wizardConnectorType,
    open: state.openWizard,
    close: state.closeWizard,
  }));

export const useLastError = () =>
  useConnectorStore((state) => state.lastError);

export const useRecentActivity = () =>
  useConnectorStore((state) => state.recentActivity);

// Subscribe to sync completion for notifications
export const subscribeToSyncCompletion = (
  callback: (instanceId: string, wasSuccessful: boolean) => void
) => {
  return useConnectorStore.subscribe(
    (state) => state.activeSyncs,
    (activeSyncs, previousActiveSyncs) => {
      // Find syncs that were active but are no longer
      Object.keys(previousActiveSyncs).forEach((instanceId) => {
        if (!activeSyncs[instanceId]) {
          // Sync completed or was cancelled
          // You can add more logic here to determine if it was successful
          callback(instanceId, true);
        }
      });
    }
  );
};

// Helper to filter instances based on current filters
export const useFilteredInstances = (orgId: string) => {
  const instances = useInstancesForOrg(orgId);
  const filters = useConnectorFilters();

  return instances.filter((instance) => {
    // Filter by status
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(instance.status)) {
        return false;
      }
    }

    // Filter by type
    if (filters.type && filters.type.length > 0) {
      if (!filters.type.includes(instance.type)) {
        return false;
      }
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const nameMatch = instance.name.toLowerCase().includes(query);
      const typeMatch = instance.type.toLowerCase().includes(query);
      if (!nameMatch && !typeMatch) {
        return false;
      }
    }

    return true;
  });
};
