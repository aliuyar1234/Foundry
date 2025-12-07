/**
 * Intelligence API Client
 * API clients for all advanced intelligence features
 */

import apiClient from './apiClient';

// Decision Archaeology API
export const decisionApi = {
  create: (data: {
    title: string;
    description: string;
    sourceType: string;
    context?: string;
    rationale?: string;
    decisionMakers?: string[];
    impactAreas?: string[];
  }) => apiClient.post('/decisions', data),

  query: (params?: {
    status?: string;
    sourceType?: string;
    decisionMaker?: string;
    impactArea?: string;
    searchText?: string;
    limit?: number;
    offset?: number;
  }) => apiClient.get('/decisions', { params }),

  getById: (id: string) => apiClient.get(`/decisions/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/decisions/${id}`, data),

  extract: (data: { text: string; sourceType: string; autoCreate?: boolean }) =>
    apiClient.post('/decisions/extract', data),

  getImpact: (id: string) => apiClient.get(`/decisions/${id}/impact`),

  getTimeline: (params?: { startDate?: string; endDate?: string; limit?: number }) =>
    apiClient.get('/decisions/timeline', { params }),

  getRelated: (id: string, limit?: number) =>
    apiClient.get(`/decisions/${id}/related`, { params: { limit } }),

  approve: (id: string) => apiClient.post(`/decisions/${id}/approve`),

  reject: (id: string, reason: string) =>
    apiClient.post(`/decisions/${id}/reject`, { reason }),
};

// SOP Generation API
export const sopApi = {
  generate: (data: {
    processId: string;
    options?: {
      detailLevel?: 'summary' | 'standard' | 'detailed';
      focusAreas?: string[];
      includeDecisions?: boolean;
    };
  }) => apiClient.post('/sop/generate', data),

  getById: (id: string) => apiClient.get(`/sop/${id}`),

  getForProcess: (processId: string) => apiClient.get(`/sop/process/${processId}`),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/sop/${id}`, data),

  submit: (id: string) => apiClient.post(`/sop/${id}/submit`),

  review: (id: string, action: 'approve' | 'reject', comments?: string) =>
    apiClient.post(`/sop/${id}/review`, { action, comments }),

  publish: (id: string) => apiClient.post(`/sop/${id}/publish`),

  createVersion: (id: string, versionType?: 'major' | 'minor' | 'patch') =>
    apiClient.post(`/sop/${id}/version`, { versionType }),

  getCompleteness: (id: string) => apiClient.get(`/sop/${id}/completeness`),
};

// Optimization API
export const optimizationApi = {
  detect: (data: {
    processId: string;
    options?: {
      types?: string[];
      minConfidence?: number;
      customCriteria?: string;
    };
  }) => apiClient.post('/optimization/detect', data),

  query: (params?: {
    processId?: string;
    type?: string;
    status?: string;
    minPriority?: number;
    limit?: number;
    offset?: number;
  }) => apiClient.get('/optimization', { params }),

  getById: (id: string) => apiClient.get(`/optimization/${id}`),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/optimization/${id}`, data),

  approve: (id: string) => apiClient.post(`/optimization/${id}/approve`),

  reject: (id: string) => apiClient.post(`/optimization/${id}/reject`),

  implement: (id: string) => apiClient.post(`/optimization/${id}/implement`),

  getSummary: (processId: string) =>
    apiClient.get(`/optimization/process/${processId}/summary`),
};

// Prediction API
export const predictionApi = {
  createModel: (data: {
    name: string;
    description: string;
    type: string;
    config: Record<string, unknown>;
  }) => apiClient.post('/predictions/models', data),

  listModels: () => apiClient.get('/predictions/models'),

  getModel: (id: string) => apiClient.get(`/predictions/models/${id}`),

  trainModel: (id: string) => apiClient.post(`/predictions/models/${id}/train`),

  predict: (data: {
    modelId: string;
    processId: string;
    instanceId?: string;
    context?: Record<string, unknown>;
  }) => apiClient.post('/predictions/predict', data),

  getPredictions: (processId: string, limit?: number) =>
    apiClient.get(`/predictions/process/${processId}`, { params: { limit } }),

  getHealth: (processId: string) => apiClient.get(`/predictions/health/${processId}`),

  getAnomalies: (processId: string) =>
    apiClient.get(`/predictions/anomalies/${processId}`),

  getForecast: (processId: string, metric: string, horizonDays?: number) =>
    apiClient.get(`/predictions/forecast/${processId}`, {
      params: { metric, horizonDays },
    }),
};

// Graph Enrichment API
export const graphApi = {
  discoverRelationships: (data?: {
    entityTypes?: string[];
    minConfidence?: number;
    limit?: number;
  }) => apiClient.post('/graph/discover', data || {}),

  enrichEntity: (data: { entityType: string; entityId: string; apply?: boolean }) =>
    apiClient.post('/graph/enrich', data),

  applyEnrichment: (enrichment: Record<string, unknown>) =>
    apiClient.post('/graph/apply', { enrichment }),

  mapExpertise: () => apiClient.post('/graph/expertise/map'),

  applyExpertise: (mappings: Array<Record<string, unknown>>) =>
    apiClient.post('/graph/expertise/apply', { mappings }),

  getClusters: (minSize?: number) =>
    apiClient.get('/graph/clusters', { params: { minSize } }),

  getStats: () => apiClient.get('/graph/stats'),
};

export default {
  decision: decisionApi,
  sop: sopApi,
  optimization: optimizationApi,
  prediction: predictionApi,
  graph: graphApi,
};
