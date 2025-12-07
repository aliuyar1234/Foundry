/**
 * Routing API Client
 * T056 - Frontend API client for routing services
 */

import { api } from './api';

// =============================================================================
// Types
// =============================================================================

export interface RouteRequest {
  content: string;
  subject?: string;
  requestType?: string;
  metadata?: Record<string, unknown>;
  options?: {
    useAI?: boolean;
    fallbackToQueue?: boolean;
    preferredHandlerId?: string;
  };
}

export interface RouteResult {
  decision: RoutingDecision;
  categories: string[];
  matchedRules: RuleMatch[];
  expertMatches: ExpertMatch[];
  confidence: number;
  processingTimeMs: number;
}

export interface RoutingDecision {
  id: string;
  organizationId: string;
  requestType: string;
  requestCategories: string[];
  selectedHandlerId: string;
  selectedHandlerType: 'person' | 'team' | 'queue' | 'auto';
  confidence: number;
  matchedRuleId?: string;
  wasEscalated: boolean;
  createdAt: string;
}

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  score: number;
  handler: {
    type: string;
    targetId?: string;
  };
}

export interface ExpertMatch {
  personId: string;
  personName: string;
  email?: string;
  expertiseScore: number;
  matchedSkills: Array<{
    skillName: string;
    level: number;
    confidence: number;
    relevance: number;
  }>;
  workloadScore?: number;
  availabilityScore?: number;
}

export interface RoutingRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;
  criteria: {
    categories?: string[];
    keywords?: string[];
    senderDomains?: string[];
    urgencyLevel?: 'low' | 'normal' | 'high' | 'critical';
  };
  handler: {
    type: 'person' | 'team' | 'queue' | 'auto';
    targetId?: string;
    fallbackTargetId?: string;
  };
  schedule?: {
    timezone?: string;
    activeHours?: { start: string; end: string };
    activeDays?: number[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityResult {
  isAvailable: boolean;
  score: number;
  status: string;
  nextAvailable?: string;
  reason?: string;
}

export interface WorkloadCapacity {
  hasCapacity: boolean;
  score: number;
  currentWorkload: number;
  maxWorkload: number;
  activeTaskCount: number;
  burnoutRisk: number;
  reason?: string;
}

export interface RoutingStats {
  totalDecisions: number;
  successfulDecisions: number;
  escalatedDecisions: number;
  averageConfidence: number;
  averageProcessingTimeMs: number;
  successRate: number;
  escalationRate: number;
}

export interface HandlerPerformance {
  handlerId: string;
  handlerName?: string;
  totalAssignments: number;
  successfulAssignments: number;
  averageConfidence: number;
  averageResolutionTimeMs?: number;
  successRate: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
  averageConfidence: number;
}

export interface RoutingSummary {
  today: RoutingStats;
  thisWeek: RoutingStats;
  thisMonth: RoutingStats;
  topCategories: CategoryDistribution[];
  topHandlers: HandlerPerformance[];
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Route a request
 */
export async function routeRequest(request: RouteRequest): Promise<RouteResult> {
  const response = await api.post('/routing/route', request);
  return response.data;
}

/**
 * Categorize content without routing
 */
export async function categorizeRequest(
  content: string,
  subject?: string,
  useAI: boolean = false
): Promise<{
  categories: string[];
  confidence: number;
  urgencyLevel: string;
}> {
  const response = await api.post('/routing/categorize', { content, subject, useAI });
  return response.data;
}

/**
 * Find experts for categories
 */
export async function findExperts(
  categories: string[],
  options?: {
    mustBeAvailable?: boolean;
    maxWorkload?: number;
    limit?: number;
  }
): Promise<{ experts: ExpertMatch[] }> {
  const response = await api.post('/routing/find-experts', { categories, options });
  return response.data;
}

/**
 * Find the best expert for categories
 */
export async function findBestExpert(
  categories: string[],
  options?: {
    mustBeAvailable?: boolean;
    maxWorkload?: number;
  }
): Promise<{ expert: ExpertMatch | null }> {
  const response = await api.post('/routing/find-expert', { categories, options });
  return response.data;
}

// =============================================================================
// Handler APIs
// =============================================================================

/**
 * Check handler availability
 */
export async function checkHandlerAvailability(
  handlerId: string
): Promise<AvailabilityResult> {
  const response = await api.get(`/routing/handlers/${handlerId}/availability`);
  return response.data;
}

/**
 * Check handler workload
 */
export async function checkHandlerWorkload(
  handlerId: string
): Promise<WorkloadCapacity> {
  const response = await api.get(`/routing/handlers/${handlerId}/workload`);
  return response.data;
}

/**
 * Get backup candidates for a handler
 */
export async function getBackupCandidates(
  handlerId: string,
  limit: number = 5
): Promise<{ candidates: ExpertMatch[] }> {
  const response = await api.get(`/routing/handlers/${handlerId}/backups`, {
    params: { limit },
  });
  return response.data;
}

/**
 * Escalate from a handler
 */
export async function escalateHandler(
  handlerId: string,
  options?: { isUrgent?: boolean; startLevel?: number }
): Promise<{
  handlerId: string;
  handlerName: string;
  handlerType: string;
  escalationLevel: number;
  reason: string;
}> {
  const response = await api.post(`/routing/handlers/${handlerId}/escalate`, options);
  return response.data;
}

// =============================================================================
// Rules APIs
// =============================================================================

/**
 * Get all routing rules
 */
export async function getRules(
  options?: { isActive?: boolean }
): Promise<{ rules: RoutingRule[] }> {
  const response = await api.get('/routing/rules', { params: options });
  return response.data;
}

/**
 * Get a specific rule
 */
export async function getRule(ruleId: string): Promise<RoutingRule> {
  const response = await api.get(`/routing/rules/${ruleId}`);
  return response.data;
}

/**
 * Create a new rule
 */
export async function createRule(
  rule: Omit<RoutingRule, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
): Promise<RoutingRule> {
  const response = await api.post('/routing/rules', rule);
  return response.data;
}

/**
 * Update a rule
 */
export async function updateRule(
  ruleId: string,
  updates: Partial<Omit<RoutingRule, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>
): Promise<RoutingRule> {
  const response = await api.put(`/routing/rules/${ruleId}`, updates);
  return response.data;
}

/**
 * Delete a rule
 */
export async function deleteRule(ruleId: string): Promise<void> {
  await api.delete(`/routing/rules/${ruleId}`);
}

// =============================================================================
// Decision APIs
// =============================================================================

/**
 * Query routing decisions
 */
export async function getDecisions(options?: {
  startTime?: string;
  endTime?: string;
  handlerId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  wasEscalated?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ decisions: RoutingDecision[] }> {
  const response = await api.get('/routing/decisions', { params: options });
  return response.data;
}

/**
 * Get a specific decision
 */
export async function getDecision(decisionId: string): Promise<RoutingDecision> {
  const response = await api.get(`/routing/decisions/${decisionId}`);
  return response.data;
}

/**
 * Submit feedback for a decision
 */
export async function submitDecisionFeedback(
  decisionId: string,
  feedback: {
    wasSuccessful: boolean;
    feedbackScore?: number;
    feedbackText?: string;
    resolutionTimeMs?: number;
  }
): Promise<{ success: boolean }> {
  const response = await api.post(`/routing/decisions/${decisionId}/feedback`, feedback);
  return response.data;
}

// =============================================================================
// Analytics APIs
// =============================================================================

/**
 * Get routing summary for dashboard
 */
export async function getRoutingSummary(): Promise<RoutingSummary> {
  const response = await api.get('/routing/analytics/summary');
  return response.data;
}

/**
 * Get routing statistics
 */
export async function getRoutingStats(options?: {
  startTime?: string;
  endTime?: string;
}): Promise<RoutingStats> {
  const response = await api.get('/routing/analytics/stats', { params: options });
  return response.data;
}

/**
 * Get handler performance
 */
export async function getHandlerPerformance(options?: {
  startTime?: string;
  endTime?: string;
}): Promise<{ handlers: HandlerPerformance[] }> {
  const response = await api.get('/routing/analytics/handlers', { params: options });
  return response.data;
}

/**
 * Get category distribution
 */
export async function getCategoryDistribution(options?: {
  startTime?: string;
  endTime?: string;
}): Promise<{ categories: CategoryDistribution[] }> {
  const response = await api.get('/routing/analytics/categories', { params: options });
  return response.data;
}

/**
 * Get routing trends
 */
export async function getRoutingTrends(options?: {
  startTime?: string;
  endTime?: string;
  interval?: 'hour' | 'day' | 'week';
}): Promise<{
  volumeOverTime: Array<{ time: string; value: number }>;
  confidenceOverTime: Array<{ time: string; value: number }>;
  successRateOverTime: Array<{ time: string; value: number }>;
  escalationRateOverTime: Array<{ time: string; value: number }>;
}> {
  const response = await api.get('/routing/analytics/trends', { params: options });
  return response.data;
}

/**
 * Get low confidence decisions
 */
export async function getLowConfidenceDecisions(
  threshold: number = 0.6,
  limit: number = 50
): Promise<{
  decisions: Array<{
    decisionId: string;
    requestType: string;
    categories: string[];
    confidence: number;
    handlerId: string;
    createdAt: string;
  }>;
}> {
  const response = await api.get('/routing/analytics/low-confidence', {
    params: { threshold, limit },
  });
  return response.data;
}

/**
 * Get rule effectiveness
 */
export async function getRuleEffectiveness(options?: {
  startTime?: string;
  endTime?: string;
}): Promise<{
  rules: Array<{
    ruleId: string;
    ruleName?: string;
    matchCount: number;
    successCount: number;
    averageConfidence: number;
    successRate: number;
  }>;
}> {
  const response = await api.get('/routing/analytics/rules', { params: options });
  return response.data;
}

export default {
  routeRequest,
  categorizeRequest,
  findExperts,
  findBestExpert,
  checkHandlerAvailability,
  checkHandlerWorkload,
  getBackupCandidates,
  escalateHandler,
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  getDecisions,
  getDecision,
  submitDecisionFeedback,
  getRoutingSummary,
  getRoutingStats,
  getHandlerPerformance,
  getCategoryDistribution,
  getRoutingTrends,
  getLowConfidenceDecisions,
  getRuleEffectiveness,
};
