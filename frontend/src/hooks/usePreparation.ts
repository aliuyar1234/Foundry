/**
 * Data Preparation Hooks
 * React Query hooks for entity records, duplicates, and exports
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

// Types
export type EntityType = 'person' | 'company' | 'address' | 'product' | 'contact';
export type EntityStatus = 'active' | 'pending_review' | 'duplicate' | 'merged' | 'deleted' | 'golden';
export type DuplicateStatus = 'pending' | 'confirmed' | 'rejected' | 'merged';
export type ExportFormat = 'sap_b1' | 'odoo' | 'dynamics_365' | 'sql' | 'csv';
export type ExportTarget = 'sap_b1' | 'odoo' | 'dynamics_365' | 'sql' | 'csv' | 'bpmn';
export type SqlDialect = 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';

export interface EntityRecord {
  id: string;
  organizationId: string;
  sourceId: string;
  externalId: string;
  entityType: EntityType;
  status: EntityStatus;
  data: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  qualityScore: number;
  qualityDetails?: QualityDetails;
  goldenRecordId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QualityDetails {
  overall: number;
  completeness: number;
  validity: number;
  consistency: number;
  accuracy: number;
  fieldScores: Record<string, {
    score: number;
    issues: string[];
  }>;
}

export interface DuplicateGroup {
  id: string;
  organizationId: string;
  entityType: EntityType;
  confidence: number;
  suggestedGoldenRecordId: string;
  matchingFields: string[];
  status: DuplicateStatus;
  records: EntityRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface MergePreview {
  mergedData: Record<string, unknown>;
  conflicts: MergeConflict[];
  selectedSources: Record<string, string>;
  qualityScore: number;
}

export interface MergeConflict {
  field: string;
  values: Array<{
    value: unknown;
    sourceId: string;
    qualityScore: number;
  }>;
  resolution: 'auto' | 'manual';
  selectedValue?: unknown;
}

export interface MergeResult {
  goldenRecordId: string;
  mergedRecordIds: string[];
  mergedData: Record<string, unknown>;
  conflictsResolved: number;
  qualityScore: number;
}

export interface ExportResult {
  format: ExportFormat;
  version: string;
  data: unknown;
  recordCount: number;
  exportedAt: string;
}

export interface EntityRecordStats {
  total: number;
  byType: Record<EntityType, number>;
  byStatus: Record<EntityStatus, number>;
  avgQualityScore: number;
  duplicateGroups: number;
}

export interface EntityRecordQueryOptions {
  entityTypes?: EntityType[];
  statuses?: EntityStatus[];
  sourceIds?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'qualityScore';
  sortOrder?: 'asc' | 'desc';
}

export interface DuplicateQueryOptions {
  entityType?: EntityType;
  status?: DuplicateStatus;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

// Query keys
const QUERY_KEYS = {
  entityRecords: (orgId: string, options?: EntityRecordQueryOptions) =>
    ['preparation', 'entity-records', orgId, options] as const,
  entityRecord: (orgId: string, recordId: string) =>
    ['preparation', 'entity-records', orgId, recordId] as const,
  entityStats: (orgId: string) =>
    ['preparation', 'entity-stats', orgId] as const,
  duplicates: (orgId: string, options?: DuplicateQueryOptions) =>
    ['preparation', 'duplicates', orgId, options] as const,
  duplicateGroup: (orgId: string, groupId: string) =>
    ['preparation', 'duplicates', orgId, groupId] as const,
  exportFormats: (orgId: string) =>
    ['preparation', 'export-formats', orgId] as const,
};

// Entity Records Hooks

export function useEntityRecords(
  organizationId: string,
  options: EntityRecordQueryOptions = {}
) {
  return useQuery({
    queryKey: QUERY_KEYS.entityRecords(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.entityTypes) params.set('entityTypes', options.entityTypes.join(','));
      if (options.statuses) params.set('statuses', options.statuses.join(','));
      if (options.sourceIds) params.set('sourceIds', options.sourceIds.join(','));
      if (options.minQualityScore !== undefined) params.set('minQualityScore', String(options.minQualityScore));
      if (options.maxQualityScore !== undefined) params.set('maxQualityScore', String(options.maxQualityScore));
      if (options.search) params.set('search', options.search);
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);

      const response = await apiClient.get<{
        data: EntityRecord[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/preparation/entity-records?${params}`);
      return response;
    },
  });
}

export function useEntityRecord(organizationId: string, recordId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.entityRecord(organizationId, recordId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: EntityRecord }>(
        `/organizations/${organizationId}/preparation/entity-records/${recordId}`
      );
      return response.data;
    },
    enabled: !!recordId,
  });
}

export function useEntityStats(organizationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.entityStats(organizationId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: EntityRecordStats }>(
        `/organizations/${organizationId}/preparation/entity-records/stats`
      );
      return response.data;
    },
  });
}

export function useCreateEntityRecord(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      entityType: EntityType;
      sourceId: string;
      externalId: string;
      data: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ data: EntityRecord }>(
        `/organizations/${organizationId}/preparation/entity-records`,
        input
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', 'entity-records', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.entityStats(organizationId),
      });
    },
  });
}

export function useUpdateEntityRecord(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recordId,
      data,
      metadata,
      status,
    }: {
      recordId: string;
      data?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      status?: EntityStatus;
    }) => {
      const response = await apiClient.patch<{ data: EntityRecord }>(
        `/organizations/${organizationId}/preparation/entity-records/${recordId}`,
        { data, metadata, status }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', 'entity-records', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.entityRecord(organizationId, variables.recordId),
      });
    },
  });
}

export function useDeleteEntityRecord(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordId: string) => {
      await apiClient.delete(
        `/organizations/${organizationId}/preparation/entity-records/${recordId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', 'entity-records', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.entityStats(organizationId),
      });
    },
  });
}

// Duplicate Detection Hooks

export function useDuplicates(
  organizationId: string,
  options: DuplicateQueryOptions = {}
) {
  return useQuery({
    queryKey: QUERY_KEYS.duplicates(organizationId, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.entityType) params.set('entityType', options.entityType);
      if (options.status) params.set('status', options.status);
      if (options.minConfidence !== undefined) params.set('minConfidence', String(options.minConfidence));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));

      const response = await apiClient.get<{
        data: DuplicateGroup[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(`/organizations/${organizationId}/preparation/duplicates?${params}`);
      return response;
    },
  });
}

export function useDuplicateGroup(organizationId: string, groupId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.duplicateGroup(organizationId, groupId),
    queryFn: async () => {
      const response = await apiClient.get<{ data: DuplicateGroup }>(
        `/organizations/${organizationId}/preparation/duplicates/${groupId}`
      );
      return response.data;
    },
    enabled: !!groupId,
  });
}

export function useUpdateDuplicateStatus(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      status,
    }: {
      groupId: string;
      status: 'confirmed' | 'rejected';
    }) => {
      const response = await apiClient.patch<{ data: { id: string; status: string; updatedAt: string } }>(
        `/organizations/${organizationId}/preparation/duplicates/${groupId}`,
        { status }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', 'duplicates', organizationId],
      });
    },
  });
}

// Merge Hooks

export function useMergePreview(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      recordIds,
      targetRecordId,
      fieldStrategies,
    }: {
      recordIds: string[];
      targetRecordId?: string;
      fieldStrategies?: Record<string, string>;
    }) => {
      const response = await apiClient.post<{ data: MergePreview }>(
        `/organizations/${organizationId}/preparation/merge`,
        {
          recordIds,
          targetRecordId,
          fieldStrategies,
          preview: true,
        }
      );
      return response.data;
    },
  });
}

export function useMergeRecords(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      recordIds,
      targetRecordId,
      fieldStrategies,
    }: {
      groupId?: string;
      recordIds: string[];
      targetRecordId?: string;
      fieldStrategies?: Record<string, string>;
    }) => {
      const response = await apiClient.post<{ data: MergeResult }>(
        `/organizations/${organizationId}/preparation/merge`,
        {
          groupId,
          recordIds,
          targetRecordId,
          fieldStrategies,
          preview: false,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', organizationId],
      });
    },
  });
}

export function useUndoMerge(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mergeId: string) => {
      await apiClient.post(
        `/organizations/${organizationId}/preparation/merge/${mergeId}/undo`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preparation', organizationId],
      });
    },
  });
}

// Export Hooks

export function useExportFormats(organizationId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.exportFormats(organizationId),
    queryFn: async () => {
      const response = await apiClient.get<{
        data: Array<{
          id: ExportFormat;
          name: string;
          description: string;
          supportedEntityTypes: EntityType[];
          fileFormat: string;
        }>;
      }>(`/organizations/${organizationId}/preparation/export/formats`);
      return response.data;
    },
  });
}

export function useExportData(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      format,
      entityTypes,
      statuses,
      includeMetadata,
      dateFrom,
      dateTo,
    }: {
      format: ExportFormat;
      entityTypes?: EntityType[];
      statuses?: EntityStatus[];
      includeMetadata?: boolean;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      const response = await apiClient.post<{ data: ExportResult }>(
        `/organizations/${organizationId}/preparation/export`,
        {
          format,
          entityTypes,
          statuses,
          includeMetadata,
          dateFrom,
          dateTo,
        }
      );
      return response.data;
    },
  });
}

// Export Preview Types and Hooks

export interface ExportPreview {
  target: ExportTarget;
  totalRecords: number;
  entities: EntityPreview[];
  validation?: ValidationResult;
  statistics: ExportStatistics;
  generatedAt: string;
}

export interface EntityPreview {
  entityType: EntityType;
  recordCount: number;
  sampleRecords: Record<string, unknown>[];
  fields: FieldPreview[];
  validation?: ValidationResult;
}

export interface FieldPreview {
  sourceField: string;
  targetField: string;
  sampleValues: unknown[];
  uniqueValues: number;
  nullCount: number;
  dataType: string;
  minLength?: number;
  maxLength?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  recordsValidated: number;
  recordsWithErrors: number;
  recordsWithWarnings: number;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    errorsByField: Record<string, number>;
    warningsByField: Record<string, number>;
    errorsByRule: Record<string, number>;
  };
}

export interface ValidationIssue {
  recordId: string;
  recordIndex: number;
  field: string;
  value: unknown;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ExportStatistics {
  recordsByType: Record<string, number>;
  fieldCoverage: Record<string, number>;
  dataQuality: {
    completeness: number;
    uniqueness: number;
    validity: number;
  };
  estimatedFileSize: number;
}

export function useExportPreview(
  organizationId: string,
  target: ExportTarget,
  entityTypes: string[]
) {
  return useQuery({
    queryKey: ['preparation', 'export-preview', organizationId, target, entityTypes],
    queryFn: async () => {
      const response = await apiClient.post<{ data: ExportPreview }>(
        `/organizations/${organizationId}/preparation/export/preview`,
        {
          target,
          entityTypes,
          sampleSize: 5,
          includeValidation: true,
          includeStatistics: true,
        }
      );
      return response.data;
    },
    enabled: entityTypes.length > 0,
  });
}

export function useExportValidation(organizationId: string) {
  return useMutation({
    mutationFn: async ({
      target,
      entityTypes,
      recordIds,
    }: {
      target: ExportTarget;
      entityTypes?: EntityType[];
      recordIds?: string[];
    }) => {
      const response = await apiClient.post<{ data: ValidationResult }>(
        `/organizations/${organizationId}/preparation/export/validate`,
        {
          target,
          entityTypes,
          recordIds,
        }
      );
      return response.data;
    },
  });
}

// SQL Export Types and Hooks

export interface SqlExportOptions {
  dialect: SqlDialect;
  entityTypes: string[];
  schema?: string;
  includeCreateTable?: boolean;
  includeTruncate?: boolean;
  batchSize?: number;
  includeMetadata?: boolean;
  preview?: boolean;
  limit?: number;
}

export interface SqlExportResult {
  format: 'sql';
  dialect: SqlDialect;
  statements: string[];
  recordCount: number;
  tableCount: number;
  exportedAt: string;
  metadata?: {
    sourceRecordIds: string[];
    tables: string[];
  };
}

export function useSqlExport(organizationId: string) {
  return useMutation({
    mutationFn: async (options: SqlExportOptions) => {
      const response = await apiClient.post<{ data: SqlExportResult }>(
        `/organizations/${organizationId}/preparation/export/sql`,
        options
      );
      return response.data;
    },
  });
}

export function useDownloadSqlExport(organizationId: string) {
  return useMutation({
    mutationFn: async (options: SqlExportOptions) => {
      const response = await apiClient.post<Blob>(
        `/organizations/${organizationId}/preparation/export/sql/download`,
        options,
        { responseType: 'blob' }
      );

      // Trigger download
      const url = URL.createObjectURL(response);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${options.dialect}_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return response;
    },
  });
}
