/**
 * Entity Provider Context
 * SCALE Tier - Task T040
 *
 * Provides multi-entity context throughout the application
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  Entity,
  EntityContext,
  EntityConfiguration,
} from '@foundry/shared/types/entity';

// API client import (adjust based on your setup)
import { api } from '../lib/api';

interface EntityState {
  currentEntity: Entity | null;
  context: EntityContext | null;
  accessibleEntities: Entity[];
  isLoading: boolean;
  error: string | null;
}

interface EntityContextValue extends EntityState {
  switchEntity: (entityId: string) => Promise<void>;
  refreshEntities: () => Promise<void>;
  canAccessEntity: (entityId: string) => boolean;
  canAccessMultipleEntities: boolean;
  getEffectiveConfig: () => EntityConfiguration | null;
}

const EntityContextInstance = createContext<EntityContextValue | null>(null);

interface EntityProviderProps {
  children: ReactNode;
}

export function EntityProvider({ children }: EntityProviderProps) {
  const [state, setState] = useState<EntityState>({
    currentEntity: null,
    context: null,
    accessibleEntities: [],
    isLoading: true,
    error: null,
  });

  /**
   * Load current entity and accessible entities on mount
   */
  useEffect(() => {
    loadEntityContext();
  }, []);

  /**
   * Load entity context from API
   */
  const loadEntityContext = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Load current entity and accessible entities in parallel
      const [currentResponse, accessibleResponse] = await Promise.all([
        api.get('/entities/current'),
        api.get('/entities/accessible'),
      ]);

      setState({
        currentEntity: currentResponse.data.entity,
        context: currentResponse.data.context,
        accessibleEntities: accessibleResponse.data.entities,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // User might not have any entities yet
      if (error.response?.status === 404) {
        setState({
          currentEntity: null,
          context: null,
          accessibleEntities: [],
          isLoading: false,
          error: null,
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error.message || 'Failed to load entity context',
        }));
      }
    }
  };

  /**
   * Switch to a different entity
   */
  const switchEntity = useCallback(async (entityId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await api.post('/entities/switch', {
        targetEntityId: entityId,
      });

      setState(prev => ({
        ...prev,
        currentEntity: response.data.entity,
        context: response.data.context,
        isLoading: false,
        error: null,
      }));

      // Optionally trigger a page reload or event to refresh other data
      window.dispatchEvent(new CustomEvent('entity-changed', {
        detail: { entityId },
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.response?.data?.error || 'Failed to switch entity',
      }));
      throw error;
    }
  }, []);

  /**
   * Refresh accessible entities list
   */
  const refreshEntities = useCallback(async () => {
    try {
      const response = await api.get('/entities/accessible');
      setState(prev => ({
        ...prev,
        accessibleEntities: response.data.entities,
      }));
    } catch (error: any) {
      console.error('Failed to refresh entities:', error);
    }
  }, []);

  /**
   * Check if user can access a specific entity
   */
  const canAccessEntity = useCallback(
    (entityId: string) => {
      if (!state.context) return false;
      if (state.context.isSuperAdmin) return true;
      return state.context.authorizedEntityIds.includes(entityId);
    },
    [state.context]
  );

  /**
   * Get effective configuration (merged from hierarchy)
   */
  const getEffectiveConfig = useCallback(() => {
    return state.currentEntity?.configuration as EntityConfiguration | null;
  }, [state.currentEntity]);

  const value: EntityContextValue = {
    ...state,
    switchEntity,
    refreshEntities,
    canAccessEntity,
    canAccessMultipleEntities: state.accessibleEntities.length > 1,
    getEffectiveConfig,
  };

  return (
    <EntityContextInstance.Provider value={value}>
      {children}
    </EntityContextInstance.Provider>
  );
}

/**
 * Hook to access entity context
 */
export function useEntity(): EntityContextValue {
  const context = useContext(EntityContextInstance);
  if (!context) {
    throw new Error('useEntity must be used within an EntityProvider');
  }
  return context;
}

/**
 * Hook to get current entity ID (throws if not set)
 */
export function useCurrentEntityId(): string {
  const { currentEntity } = useEntity();
  if (!currentEntity) {
    throw new Error('No entity context established');
  }
  return currentEntity.id;
}

/**
 * Hook to check entity permissions
 */
export function useEntityPermissions() {
  const { context } = useEntity();

  return {
    canRead: context?.permissions.canRead ?? false,
    canWrite: context?.permissions.canWrite ?? false,
    canAdmin: context?.permissions.canAdmin ?? false,
    isSuperAdmin: context?.isSuperAdmin ?? false,
  };
}

/**
 * Hook to listen for entity changes
 */
export function useEntityChangeListener(callback: (entityId: string) => void) {
  useEffect(() => {
    const handler = (event: CustomEvent<{ entityId: string }>) => {
      callback(event.detail.entityId);
    };

    window.addEventListener('entity-changed', handler as EventListener);
    return () => {
      window.removeEventListener('entity-changed', handler as EventListener);
    };
  }, [callback]);
}

export default EntityProvider;
