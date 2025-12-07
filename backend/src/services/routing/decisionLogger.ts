/**
 * Decision Logger Service
 * T046 - Create routing decision logger
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { insertRoutingDecision } from '../operate/timescaleClient.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface DecisionLogEntry {
  decisionId: string;
  organizationId: string;
  requestId: string;
  requestType: string;
  categories: string[];
  selectedHandlerId: string;
  selectedHandlerType: 'person' | 'team' | 'queue' | 'auto';
  confidence: number;
  matchedRuleId?: string;
  alternativeHandlers: AlternativeHandler[];
  processingTimeMs: number;
  wasEscalated: boolean;
  escalationLevel?: number;
  metadata?: Record<string, unknown>;
}

export interface AlternativeHandler {
  handlerId: string;
  handlerType: string;
  score: number;
  reason: string;
}

export interface DecisionQueryOptions {
  startTime?: Date;
  endTime?: Date;
  handlerId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  wasEscalated?: boolean;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Log a routing decision
 */
export async function logDecision(entry: DecisionLogEntry): Promise<void> {
  const startTime = Date.now();

  try {
    // Store in PostgreSQL for relational queries
    await prisma.routingDecision.create({
      data: {
        id: entry.decisionId,
        organizationId: entry.organizationId,
        requestType: entry.requestType,
        requestCategories: entry.categories,
        selectedHandlerId: entry.selectedHandlerId,
        selectedHandlerType: entry.selectedHandlerType,
        confidence: entry.confidence,
        matchedRuleId: entry.matchedRuleId,
        alternativeHandlers: entry.alternativeHandlers,
        processingTimeMs: entry.processingTimeMs,
        wasEscalated: entry.wasEscalated,
        metadata: entry.metadata || {},
      },
    });

    // Store in TimescaleDB for time-series analytics
    await insertRoutingDecision({
      time: new Date(),
      organization_id: entry.organizationId,
      decision_id: entry.decisionId,
      request_type: entry.requestType,
      handler_id: entry.selectedHandlerId,
      handler_type: entry.selectedHandlerType,
      confidence_score: entry.confidence,
      was_escalated: entry.wasEscalated,
      processing_time_ms: entry.processingTimeMs,
      was_successful: true, // Will be updated later
    });

    const duration = Date.now() - startTime;
    logger.debug({
      decisionId: entry.decisionId,
      duration,
    }, 'Decision logged successfully');
  } catch (error) {
    logger.error({ error, decisionId: entry.decisionId }, 'Failed to log decision');
    throw error;
  }
}

/**
 * Update decision outcome (success/failure)
 */
export async function updateDecisionOutcome(
  decisionId: string,
  outcome: {
    wasSuccessful: boolean;
    feedbackScore?: number;
    feedbackText?: string;
    resolutionTimeMs?: number;
  }
): Promise<void> {
  try {
    await prisma.routingDecision.update({
      where: { id: decisionId },
      data: {
        wasSuccessful: outcome.wasSuccessful,
        metadata: {
          feedbackScore: outcome.feedbackScore,
          feedbackText: outcome.feedbackText,
          resolutionTimeMs: outcome.resolutionTimeMs,
        },
        updatedAt: new Date(),
      },
    });

    logger.debug({
      decisionId,
      wasSuccessful: outcome.wasSuccessful,
    }, 'Decision outcome updated');
  } catch (error) {
    logger.error({ error, decisionId }, 'Failed to update decision outcome');
    throw error;
  }
}

/**
 * Query routing decisions
 */
export async function queryDecisions(
  organizationId: string,
  options: DecisionQueryOptions = {}
): Promise<DecisionLogEntry[]> {
  const {
    startTime,
    endTime,
    handlerId,
    minConfidence,
    maxConfidence,
    wasEscalated,
    limit = 100,
    offset = 0,
  } = options;

  const where: Record<string, unknown> = {
    organizationId,
  };

  if (startTime || endTime) {
    where.createdAt = {};
    if (startTime) (where.createdAt as Record<string, Date>).gte = startTime;
    if (endTime) (where.createdAt as Record<string, Date>).lte = endTime;
  }

  if (handlerId) {
    where.selectedHandlerId = handlerId;
  }

  if (minConfidence !== undefined || maxConfidence !== undefined) {
    where.confidence = {};
    if (minConfidence !== undefined) (where.confidence as Record<string, number>).gte = minConfidence;
    if (maxConfidence !== undefined) (where.confidence as Record<string, number>).lte = maxConfidence;
  }

  if (wasEscalated !== undefined) {
    where.wasEscalated = wasEscalated;
  }

  const decisions = await prisma.routingDecision.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return decisions.map(d => ({
    decisionId: d.id,
    organizationId: d.organizationId,
    requestId: d.id, // Using decision ID as request ID
    requestType: d.requestType,
    categories: d.requestCategories,
    selectedHandlerId: d.selectedHandlerId,
    selectedHandlerType: d.selectedHandlerType as 'person' | 'team' | 'queue' | 'auto',
    confidence: d.confidence,
    matchedRuleId: d.matchedRuleId || undefined,
    alternativeHandlers: d.alternativeHandlers as AlternativeHandler[],
    processingTimeMs: d.processingTimeMs,
    wasEscalated: d.wasEscalated,
    metadata: d.metadata as Record<string, unknown>,
  }));
}

/**
 * Get decision by ID
 */
export async function getDecision(decisionId: string): Promise<DecisionLogEntry | null> {
  const decision = await prisma.routingDecision.findUnique({
    where: { id: decisionId },
  });

  if (!decision) return null;

  return {
    decisionId: decision.id,
    organizationId: decision.organizationId,
    requestId: decision.id,
    requestType: decision.requestType,
    categories: decision.requestCategories,
    selectedHandlerId: decision.selectedHandlerId,
    selectedHandlerType: decision.selectedHandlerType as 'person' | 'team' | 'queue' | 'auto',
    confidence: decision.confidence,
    matchedRuleId: decision.matchedRuleId || undefined,
    alternativeHandlers: decision.alternativeHandlers as AlternativeHandler[],
    processingTimeMs: decision.processingTimeMs,
    wasEscalated: decision.wasEscalated,
    metadata: decision.metadata as Record<string, unknown>,
  };
}

/**
 * Get decisions for a specific handler
 */
export async function getHandlerDecisions(
  organizationId: string,
  handlerId: string,
  limit: number = 50
): Promise<DecisionLogEntry[]> {
  return queryDecisions(organizationId, { handlerId, limit });
}

/**
 * Delete old decisions (for cleanup)
 */
export async function deleteOldDecisions(
  organizationId: string,
  olderThan: Date
): Promise<number> {
  const result = await prisma.routingDecision.deleteMany({
    where: {
      organizationId,
      createdAt: { lt: olderThan },
    },
  });

  logger.info({
    organizationId,
    olderThan,
    deletedCount: result.count,
  }, 'Old decisions deleted');

  return result.count;
}

export default {
  logDecision,
  updateDecisionOutcome,
  queryDecisions,
  getDecision,
  getHandlerDecisions,
  deleteOldDecisions,
};
