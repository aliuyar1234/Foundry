/**
 * Routing Engine Service
 * T031 - Main routing engine that orchestrates request routing
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { categorizeRequest, CategoryResult } from './requestCategorizer.js';
import { matchRules, RuleMatch } from './ruleMatcher.js';
import { calculateConfidence } from './confidenceScorer.js';
import { findBestExpert, ExpertMatch } from './expertiseMatcher.js';
import { checkWorkloadCapacity } from './workloadBalancer.js';
import { checkAvailability } from './availabilityChecker.js';
import { handleEscalation } from './escalationHandler.js';
import { selectBackup } from './backupSelector.js';
import { logRoutingDecision } from './decisionLogger.js';
import {
  RoutingRequest,
  RoutingDecision,
  RoutingAnalysisResult,
  AlternativeHandler,
} from '@foundry/shared';

// =============================================================================
// Types
// =============================================================================

export interface RoutingContext {
  organizationId: string;
  userId: string;
  timestamp: Date;
}

export interface RoutingOptions {
  /** Skip workload checks */
  ignoreWorkload?: boolean;
  /** Force specific handler */
  preferredHandlerId?: string;
  /** Skip AI categorization, use provided categories */
  providedCategories?: string[];
  /** Skip rule matching */
  skipRules?: boolean;
  /** Maximum alternatives to return */
  maxAlternatives?: number;
}

// =============================================================================
// Main Routing Engine
// =============================================================================

/**
 * Route a request to the most appropriate handler
 */
export async function routeRequest(
  request: RoutingRequest,
  context: RoutingContext,
  options: RoutingOptions = {}
): Promise<RoutingAnalysisResult> {
  const startTime = Date.now();
  const { organizationId } = context;

  logger.info({ requestId: request.id, organizationId }, 'Starting request routing');

  try {
    // Step 1: Categorize the request
    const categoryResult = options.providedCategories
      ? { categories: options.providedCategories, urgencyScore: 0.5, confidence: 1.0 }
      : await categorizeRequest(request.content, request.subject, request.metadata);

    // Step 2: Match against routing rules
    const matchedRules = options.skipRules
      ? []
      : await matchRules(organizationId, categoryResult.categories, {
          urgencyScore: categoryResult.urgencyScore,
          senderEmail: request.senderEmail,
          requestType: request.type,
        });

    // Step 3: Find handler based on rules or expertise
    let handlerResult: HandlerResult;

    if (matchedRules.length > 0 && matchedRules[0].matchScore >= 0.8) {
      // Use rule-based routing
      handlerResult = await resolveRuleHandler(
        matchedRules[0],
        organizationId,
        options
      );
    } else {
      // Use AI-based expertise matching
      handlerResult = await resolveExpertHandler(
        categoryResult,
        organizationId,
        options
      );
    }

    // Step 4: Verify handler availability and capacity
    const finalHandler = await ensureHandlerAvailable(
      handlerResult,
      organizationId,
      options
    );

    // Step 5: Calculate overall confidence
    const confidence = calculateConfidence({
      categoryConfidence: categoryResult.confidence,
      ruleMatchScore: matchedRules[0]?.matchScore,
      expertiseScore: handlerResult.expertiseScore,
      workloadScore: finalHandler.workloadScore,
      availabilityScore: finalHandler.availabilityScore,
    });

    // Step 6: Generate reasoning
    const reasoning = generateReasoning(
      categoryResult,
      matchedRules,
      finalHandler
    );

    // Step 7: Find alternative handlers
    const alternatives = await findAlternatives(
      categoryResult,
      finalHandler.handlerId,
      organizationId,
      options.maxAlternatives || 3
    );

    // Build decision
    const decision: RoutingDecision = {
      id: `rd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      requestId: request.id,
      requestType: request.type,
      requestContent: request.content,
      categories: categoryResult.categories,
      urgencyScore: categoryResult.urgencyScore,
      handlerId: finalHandler.handlerId,
      handlerType: finalHandler.handlerType,
      handlerName: finalHandler.handlerName,
      ruleId: finalHandler.ruleId,
      ruleName: finalHandler.ruleName,
      confidence,
      reasoning,
      alternativeHandlers: alternatives,
      wasEscalated: finalHandler.wasEscalated,
      wasRerouted: finalHandler.wasRerouted,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const processingTimeMs = Date.now() - startTime;

    // Log the decision
    await logRoutingDecision(decision, processingTimeMs);

    logger.info({
      requestId: request.id,
      handlerId: decision.handlerId,
      confidence,
      processingTimeMs,
    }, 'Request routing completed');

    return {
      decision,
      matchedRules: matchedRules.map(r => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        matchScore: r.matchScore,
      })),
      processingTimeMs,
    };
  } catch (error) {
    logger.error({ error, requestId: request.id }, 'Request routing failed');
    throw error;
  }
}

// =============================================================================
// Helper Types and Functions
// =============================================================================

interface HandlerResult {
  handlerId: string;
  handlerType: 'person' | 'team' | 'queue';
  handlerName?: string;
  ruleId?: string;
  ruleName?: string;
  expertiseScore?: number;
  workloadScore?: number;
  availabilityScore?: number;
  wasEscalated: boolean;
  wasRerouted: boolean;
}

/**
 * Resolve handler from a matched rule
 */
async function resolveRuleHandler(
  rule: RuleMatch,
  organizationId: string,
  options: RoutingOptions
): Promise<HandlerResult> {
  const handler = rule.handler;

  if (handler.type === 'round_robin' && handler.roundRobinIds) {
    // Select from round robin pool based on workload
    const selectedId = await selectFromRoundRobin(
      handler.roundRobinIds,
      organizationId,
      options.ignoreWorkload
    );
    return {
      handlerId: selectedId,
      handlerType: 'person',
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      wasEscalated: false,
      wasRerouted: false,
    };
  }

  return {
    handlerId: handler.personId || handler.teamId || handler.queueName || 'unknown',
    handlerType: handler.type === 'person' ? 'person' : handler.type === 'team' ? 'team' : 'queue',
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    wasEscalated: false,
    wasRerouted: false,
  };
}

/**
 * Resolve handler based on expertise matching
 */
async function resolveExpertHandler(
  categoryResult: CategoryResult,
  organizationId: string,
  options: RoutingOptions
): Promise<HandlerResult> {
  // If preferred handler specified, try them first
  if (options.preferredHandlerId) {
    const available = await checkAvailability(options.preferredHandlerId, organizationId);
    if (available.isAvailable) {
      return {
        handlerId: options.preferredHandlerId,
        handlerType: 'person',
        expertiseScore: 0.8,
        wasEscalated: false,
        wasRerouted: false,
      };
    }
  }

  // Find best expert for the categories
  const expertMatch = await findBestExpert(
    organizationId,
    categoryResult.categories,
    {
      mustBeAvailable: !options.ignoreWorkload,
    }
  );

  if (expertMatch) {
    return {
      handlerId: expertMatch.personId,
      handlerType: 'person',
      handlerName: expertMatch.personName,
      expertiseScore: expertMatch.expertiseScore,
      wasEscalated: false,
      wasRerouted: false,
    };
  }

  // No expert found - escalate to default queue
  return {
    handlerId: 'default_queue',
    handlerType: 'queue',
    wasEscalated: true,
    wasRerouted: false,
  };
}

/**
 * Ensure the selected handler is available
 */
async function ensureHandlerAvailable(
  handler: HandlerResult,
  organizationId: string,
  options: RoutingOptions
): Promise<HandlerResult> {
  if (handler.handlerType !== 'person' || options.ignoreWorkload) {
    return handler;
  }

  // Check availability
  const availability = await checkAvailability(handler.handlerId, organizationId);
  handler.availabilityScore = availability.score;

  if (!availability.isAvailable) {
    // Try to find backup
    const backup = await selectBackup(handler.handlerId, organizationId);
    if (backup) {
      return {
        ...handler,
        handlerId: backup.personId,
        handlerName: backup.personName,
        wasRerouted: true,
      };
    }

    // Escalate
    const escalation = await handleEscalation(handler.handlerId, organizationId);
    return {
      ...handler,
      handlerId: escalation.handlerId,
      handlerName: escalation.handlerName,
      handlerType: escalation.handlerType,
      wasEscalated: true,
    };
  }

  // Check workload capacity
  const workload = await checkWorkloadCapacity(handler.handlerId, organizationId);
  handler.workloadScore = workload.score;

  if (!workload.hasCapacity) {
    // Redistribute to someone with capacity
    const backup = await selectBackup(handler.handlerId, organizationId, {
      requireCapacity: true,
    });
    if (backup) {
      return {
        ...handler,
        handlerId: backup.personId,
        handlerName: backup.personName,
        workloadScore: backup.workloadScore,
        wasRerouted: true,
      };
    }
  }

  return handler;
}

/**
 * Select from round robin pool
 */
async function selectFromRoundRobin(
  personIds: string[],
  organizationId: string,
  ignoreWorkload?: boolean
): Promise<string> {
  if (ignoreWorkload) {
    // Simple round robin
    const lastSelected = await prisma.routingDecision.findFirst({
      where: {
        organizationId,
        handlerId: { in: personIds },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastSelected) {
      const currentIndex = personIds.indexOf(lastSelected.handlerId);
      const nextIndex = (currentIndex + 1) % personIds.length;
      return personIds[nextIndex];
    }

    return personIds[0];
  }

  // Workload-aware round robin
  const workloads = await Promise.all(
    personIds.map(async (id) => ({
      id,
      workload: await checkWorkloadCapacity(id, organizationId),
    }))
  );

  // Select person with lowest workload who has capacity
  const available = workloads
    .filter(w => w.workload.hasCapacity)
    .sort((a, b) => a.workload.currentWorkload - b.workload.currentWorkload);

  return available[0]?.id || personIds[0];
}

/**
 * Find alternative handlers
 */
async function findAlternatives(
  categoryResult: CategoryResult,
  excludeId: string,
  organizationId: string,
  limit: number
): Promise<AlternativeHandler[]> {
  const experts = await findBestExpert(organizationId, categoryResult.categories, {
    mustBeAvailable: true,
    limit: limit + 1,
  });

  // This is a simplified version - in real implementation would return array
  if (!experts || experts.personId === excludeId) {
    return [];
  }

  return [{
    handlerId: experts.personId,
    handlerType: 'person',
    handlerName: experts.personName,
    confidence: experts.expertiseScore,
    reason: `Expert in ${categoryResult.categories.slice(0, 2).join(', ')}`,
  }];
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  categoryResult: CategoryResult,
  matchedRules: RuleMatch[],
  handler: HandlerResult
): string {
  const parts: string[] = [];

  // Categories
  if (categoryResult.categories.length > 0) {
    parts.push(`Request categorized as: ${categoryResult.categories.join(', ')}`);
  }

  // Urgency
  if (categoryResult.urgencyScore > 0.7) {
    parts.push('High urgency detected');
  }

  // Rule match
  if (handler.ruleId && matchedRules.length > 0) {
    parts.push(`Matched routing rule: "${handler.ruleName}"`);
  }

  // Expertise
  if (handler.expertiseScore && handler.expertiseScore > 0.7) {
    parts.push(`${handler.handlerName || 'Handler'} has strong expertise in this area`);
  }

  // Rerouting
  if (handler.wasRerouted) {
    parts.push('Original handler unavailable, rerouted to backup');
  }

  // Escalation
  if (handler.wasEscalated) {
    parts.push('Escalated due to no available expert');
  }

  return parts.join('. ') + '.';
}

// =============================================================================
// Batch Routing
// =============================================================================

/**
 * Route multiple requests
 */
export async function routeRequests(
  requests: RoutingRequest[],
  context: RoutingContext,
  options: RoutingOptions = {}
): Promise<RoutingAnalysisResult[]> {
  const results: RoutingAnalysisResult[] = [];

  for (const request of requests) {
    try {
      const result = await routeRequest(request, context, options);
      results.push(result);
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Failed to route request in batch');
    }
  }

  return results;
}

export default {
  routeRequest,
  routeRequests,
};
