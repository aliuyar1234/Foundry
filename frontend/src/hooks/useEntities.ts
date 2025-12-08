/**
 * useEntities Hook
 * SCALE Tier - Task T047
 *
 * Hook for entity management operations
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Entity,
  CreateEntityInput,
  UpdateEntityInput,
  EntityWithHierarchy,
  EntityPath,
  EntityAnalytics,
  CrossEntityAggregation,
  ListEntitiesRequest,
  ListEntitiesResponse,
} from '@foundry/shared/types/entity';
import { api } from '../lib/api';

interface UseEntitiesOptions {
  autoLoad?: boolean;
  parentEntityId?: string;
}

interface UseEntitiesReturn {
  entities: Entity[];
  isLoading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;

  // Operations
  loadEntities: (params?: ListEntitiesRequest) => Promise<void>;
  createEntity: (input: CreateEntityInput) => Promise<Entity>;
  updateEntity: (id: string, input: UpdateEntityInput) => Promise<Entity>;
  archiveEntity: (id: string) => Promise<Entity>;
  suspendEntity: (id: string) => Promise<Entity>;
  reactivateEntity: (id: string) => Promise<Entity>;
  getEntity: (id: string) => Promise<Entity>;
  getHierarchy: (id: string) => Promise<{ entity: EntityWithHierarchy; path: EntityPath }>;
  getAnalytics: (entityIds: string[]) => Promise<CrossEntityAggregation>;
}

/**
 * Hook for entity list and CRUD operations
 */
export function useEntities(options: UseEntitiesOptions = {}): UseEntitiesReturn {
  const { autoLoad = true, parentEntityId } = options;

  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /**
   * Load entities with optional filters
   */
  const loadEntities = useCallback(async (params?: ListEntitiesRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<ListEntitiesResponse>('/entities', {
        params: {
          parentEntityId: params?.parentEntityId ?? parentEntityId,
          status: params?.status,
          search: params?.search,
          includeChildren: params?.includeChildren,
          page: params?.page ?? 1,
          pageSize: params?.pageSize ?? 20,
        },
      });

      setEntities(response.data.entities);
      setTotal(response.data.total);
      setPage(response.data.page);
      setPageSize(response.data.pageSize);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load entities');
    } finally {
      setIsLoading(false);
    }
  }, [parentEntityId]);

  /**
   * Create a new entity
   */
  const createEntity = useCallback(async (input: CreateEntityInput): Promise<Entity> => {
    const response = await api.post<Entity>('/entities', input);

    // Refresh list
    await loadEntities();

    return response.data;
  }, [loadEntities]);

  /**
   * Update an entity
   */
  const updateEntity = useCallback(async (
    id: string,
    input: UpdateEntityInput
  ): Promise<Entity> => {
    const response = await api.put<Entity>(`/entities/${id}`, input);

    // Update local state
    setEntities(prev =>
      prev.map(e => (e.id === id ? response.data : e))
    );

    return response.data;
  }, []);

  /**
   * Archive an entity
   */
  const archiveEntity = useCallback(async (id: string): Promise<Entity> => {
    const response = await api.delete<Entity>(`/entities/${id}`);

    // Update local state
    setEntities(prev =>
      prev.map(e => (e.id === id ? response.data : e))
    );

    return response.data;
  }, []);

  /**
   * Suspend an entity
   */
  const suspendEntity = useCallback(async (id: string): Promise<Entity> => {
    const response = await api.post<Entity>(`/entities/${id}/suspend`);

    // Update local state
    setEntities(prev =>
      prev.map(e => (e.id === id ? response.data : e))
    );

    return response.data;
  }, []);

  /**
   * Reactivate an entity
   */
  const reactivateEntity = useCallback(async (id: string): Promise<Entity> => {
    const response = await api.post<Entity>(`/entities/${id}/reactivate`);

    // Update local state
    setEntities(prev =>
      prev.map(e => (e.id === id ? response.data : e))
    );

    return response.data;
  }, []);

  /**
   * Get a single entity
   */
  const getEntity = useCallback(async (id: string): Promise<Entity> => {
    const response = await api.get<Entity>(`/entities/${id}`);
    return response.data;
  }, []);

  /**
   * Get entity hierarchy
   */
  const getHierarchy = useCallback(async (
    id: string
  ): Promise<{ entity: EntityWithHierarchy; path: EntityPath }> => {
    const response = await api.get(`/entities/${id}/hierarchy`);
    return response.data;
  }, []);

  /**
   * Get cross-entity analytics
   */
  const getAnalytics = useCallback(async (
    entityIds: string[]
  ): Promise<CrossEntityAggregation> => {
    const response = await api.get<CrossEntityAggregation>(
      `/entities/${entityIds[0]}/analytics`,
      { params: { entityIds: entityIds.join(',') } }
    );
    return response.data;
  }, []);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadEntities();
    }
  }, [autoLoad, loadEntities]);

  return {
    entities,
    isLoading,
    error,
    total,
    page,
    pageSize,
    loadEntities,
    createEntity,
    updateEntity,
    archiveEntity,
    suspendEntity,
    reactivateEntity,
    getEntity,
    getHierarchy,
    getAnalytics,
  };
}

/**
 * Hook for single entity operations
 */
export function useEntityById(entityId: string | null) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntity = useCallback(async () => {
    if (!entityId) {
      setEntity(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<Entity>(`/entities/${entityId}`);
      setEntity(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load entity');
    } finally {
      setIsLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    loadEntity();
  }, [loadEntity]);

  return {
    entity,
    isLoading,
    error,
    reload: loadEntity,
  };
}

/**
 * Hook for entity hierarchy
 */
export function useEntityHierarchy(entityId: string | null) {
  const [hierarchy, setHierarchy] = useState<EntityWithHierarchy | null>(null);
  const [path, setPath] = useState<EntityPath | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHierarchy = useCallback(async () => {
    if (!entityId) {
      setHierarchy(null);
      setPath(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(`/entities/${entityId}/hierarchy`);
      setHierarchy(response.data.entity);
      setPath(response.data.path);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load hierarchy');
    } finally {
      setIsLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  return {
    hierarchy,
    path,
    isLoading,
    error,
    reload: loadHierarchy,
  };
}

/**
 * Hook for cross-entity analytics
 */
export function useCrossEntityAnalytics(entityIds: string[]) {
  const [analytics, setAnalytics] = useState<CrossEntityAggregation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (entityIds.length === 0) {
      setAnalytics(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<CrossEntityAggregation>(
        `/entities/${entityIds[0]}/analytics`,
        { params: { entityIds: entityIds.join(',') } }
      );
      setAnalytics(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [entityIds.join(',')]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return {
    analytics,
    isLoading,
    error,
    reload: loadAnalytics,
  };
}

export default useEntities;
