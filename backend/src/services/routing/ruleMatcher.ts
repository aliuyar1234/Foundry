/**
 * Rule Matcher Service
 * T033 - Create routing rule matcher
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { RequestCriteria, RouteHandler } from '@foundry/shared';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  matchScore: number;
  matchedCriteria: string[];
  handler: RouteHandler;
  priority: number;
}

export interface MatchContext {
  urgencyScore?: number;
  senderEmail?: string;
  requestType?: string;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Main Matching Function
// =============================================================================

/**
 * Match categories against routing rules
 */
export async function matchRules(
  organizationId: string,
  categories: string[],
  context: MatchContext = {}
): Promise<RuleMatch[]> {
  // Fetch active rules ordered by priority
  const rules = await prisma.routingRule.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    orderBy: {
      priority: 'asc', // Lower number = higher priority
    },
  });

  if (rules.length === 0) {
    return [];
  }

  // Match each rule
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    const criteria = rule.criteria as RequestCriteria;
    const handler = rule.handler as RouteHandler;

    const matchResult = evaluateRule(criteria, categories, context);

    if (matchResult.score > 0) {
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchScore: matchResult.score,
        matchedCriteria: matchResult.matchedCriteria,
        handler,
        priority: rule.priority,
      });
    }
  }

  // Sort by score descending, then by priority ascending
  matches.sort((a, b) => {
    if (Math.abs(a.matchScore - b.matchScore) > 0.1) {
      return b.matchScore - a.matchScore;
    }
    return a.priority - b.priority;
  });

  logger.debug({ organizationId, matchCount: matches.length }, 'Rule matching completed');

  return matches;
}

/**
 * Evaluate a single rule against categories and context
 */
function evaluateRule(
  criteria: RequestCriteria,
  categories: string[],
  context: MatchContext
): { score: number; matchedCriteria: string[] } {
  const matchedCriteria: string[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  // Category matching (weight: 40%)
  if (criteria.categories && criteria.categories.length > 0) {
    totalWeight += 40;
    const categoryMatches = categories.filter(c =>
      criteria.categories!.some(rc =>
        c.toLowerCase() === rc.toLowerCase() ||
        c.toLowerCase().includes(rc.toLowerCase()) ||
        rc.toLowerCase().includes(c.toLowerCase())
      )
    );

    if (categoryMatches.length > 0) {
      const categoryScore = (categoryMatches.length / criteria.categories.length) * 40;
      matchedWeight += categoryScore;
      matchedCriteria.push(`categories:${categoryMatches.join(',')}`);
    }
  }

  // Keyword matching (weight: 20%)
  if (criteria.keywords && criteria.keywords.length > 0 && context.keywords) {
    totalWeight += 20;
    const keywordMatches = context.keywords.filter(k =>
      criteria.keywords!.some(rk => k.toLowerCase().includes(rk.toLowerCase()))
    );

    if (keywordMatches.length > 0) {
      const keywordScore = Math.min(20, (keywordMatches.length / criteria.keywords.length) * 20);
      matchedWeight += keywordScore;
      matchedCriteria.push(`keywords:${keywordMatches.join(',')}`);
    }
  }

  // Sender matching (weight: 15%)
  if (criteria.senders && criteria.senders.length > 0 && context.senderEmail) {
    totalWeight += 15;
    const senderMatch = criteria.senders.some(pattern => {
      if (pattern.startsWith('@')) {
        // Domain match
        return context.senderEmail!.endsWith(pattern);
      }
      if (pattern.includes('*')) {
        // Wildcard match
        const regex = new RegExp('^' + pattern.replace('*', '.*') + '$', 'i');
        return regex.test(context.senderEmail!);
      }
      // Exact match
      return context.senderEmail!.toLowerCase() === pattern.toLowerCase();
    });

    if (senderMatch) {
      matchedWeight += 15;
      matchedCriteria.push(`sender:${context.senderEmail}`);
    }
  }

  // Urgency matching (weight: 15%)
  if (criteria.minUrgency !== undefined || criteria.maxUrgency !== undefined) {
    totalWeight += 15;
    const urgency = context.urgencyScore ?? 0.5;

    const meetsMin = criteria.minUrgency === undefined || urgency >= criteria.minUrgency;
    const meetsMax = criteria.maxUrgency === undefined || urgency <= criteria.maxUrgency;

    if (meetsMin && meetsMax) {
      matchedWeight += 15;
      matchedCriteria.push(`urgency:${urgency.toFixed(2)}`);
    }
  }

  // Request type matching (weight: 10%)
  if (criteria.requestTypes && criteria.requestTypes.length > 0 && context.requestType) {
    totalWeight += 10;
    if (criteria.requestTypes.includes(context.requestType)) {
      matchedWeight += 10;
      matchedCriteria.push(`type:${context.requestType}`);
    }
  }

  // Custom expression (if present, acts as filter)
  if (criteria.customExpression) {
    try {
      const expressionMatch = evaluateExpression(criteria.customExpression, {
        categories,
        ...context,
      });
      if (!expressionMatch) {
        return { score: 0, matchedCriteria: [] };
      }
      matchedCriteria.push('expression:matched');
    } catch (error) {
      logger.warn({ error, expression: criteria.customExpression }, 'Failed to evaluate custom expression');
    }
  }

  // Calculate final score
  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  return {
    score,
    matchedCriteria,
  };
}

/**
 * Evaluate custom expression
 */
function evaluateExpression(
  expression: string,
  context: Record<string, unknown>
): boolean {
  // Simple expression evaluator for common patterns
  // Format: "field operator value" or "field.includes(value)"

  // Sanitize expression to prevent injection
  const sanitized = expression.replace(/[^a-zA-Z0-9_.\s=!<>()'"&|]/g, '');

  // Simple equality check
  const equalityMatch = sanitized.match(/^(\w+)\s*===?\s*['"]?(\w+)['"]?$/);
  if (equalityMatch) {
    const [, field, value] = equalityMatch;
    return String(context[field]) === value;
  }

  // Array includes check
  const includesMatch = sanitized.match(/^(\w+)\.includes\(['"](\w+)['"]\)$/);
  if (includesMatch) {
    const [, field, value] = includesMatch;
    const arr = context[field];
    if (Array.isArray(arr)) {
      return arr.some(item => String(item).toLowerCase().includes(value.toLowerCase()));
    }
  }

  // AND/OR logic
  if (sanitized.includes(' && ') || sanitized.includes(' || ')) {
    const parts = sanitized.split(/\s*(&&|\|\|)\s*/);
    let result = evaluateExpression(parts[0], context);

    for (let i = 1; i < parts.length; i += 2) {
      const operator = parts[i];
      const nextResult = evaluateExpression(parts[i + 1], context);

      if (operator === '&&') {
        result = result && nextResult;
      } else if (operator === '||') {
        result = result || nextResult;
      }
    }

    return result;
  }

  // Default: expression not understood
  logger.warn({ expression: sanitized }, 'Unrecognized expression format');
  return true;
}

// =============================================================================
// Rule CRUD Operations
// =============================================================================

/**
 * Create a new routing rule
 */
export async function createRule(
  organizationId: string,
  name: string,
  criteria: RequestCriteria,
  handler: RouteHandler,
  options: {
    description?: string;
    priority?: number;
    fallbackHandler?: RouteHandler;
    workloadLimit?: number;
    createdBy: string;
  }
): Promise<string> {
  const rule = await prisma.routingRule.create({
    data: {
      name,
      description: options.description,
      priority: options.priority ?? 100,
      isActive: true,
      criteria: criteria as object,
      handler: handler as object,
      fallbackHandler: options.fallbackHandler as object | undefined,
      workloadLimit: options.workloadLimit,
      createdBy: options.createdBy,
      organizationId,
    },
  });

  logger.info({ ruleId: rule.id, name }, 'Routing rule created');
  return rule.id;
}

/**
 * Update a routing rule
 */
export async function updateRule(
  ruleId: string,
  updates: {
    name?: string;
    description?: string;
    priority?: number;
    isActive?: boolean;
    criteria?: RequestCriteria;
    handler?: RouteHandler;
    fallbackHandler?: RouteHandler;
    workloadLimit?: number;
  }
): Promise<void> {
  await prisma.routingRule.update({
    where: { id: ruleId },
    data: {
      name: updates.name,
      description: updates.description,
      priority: updates.priority,
      isActive: updates.isActive,
      criteria: updates.criteria as object | undefined,
      handler: updates.handler as object | undefined,
      fallbackHandler: updates.fallbackHandler as object | undefined,
      workloadLimit: updates.workloadLimit,
      updatedAt: new Date(),
    },
  });

  logger.info({ ruleId }, 'Routing rule updated');
}

/**
 * Delete a routing rule
 */
export async function deleteRule(ruleId: string): Promise<void> {
  await prisma.routingRule.delete({
    where: { id: ruleId },
  });

  logger.info({ ruleId }, 'Routing rule deleted');
}

/**
 * Get all rules for an organization
 */
export async function getRules(
  organizationId: string,
  options: {
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  rules: Array<{
    id: string;
    name: string;
    description?: string;
    priority: number;
    isActive: boolean;
    criteria: RequestCriteria;
    handler: RouteHandler;
  }>;
  total: number;
}> {
  const where = {
    organizationId,
    ...(options.includeInactive ? {} : { isActive: true }),
  };

  const [rules, total] = await Promise.all([
    prisma.routingRule.findMany({
      where,
      orderBy: { priority: 'asc' },
      take: options.limit,
      skip: options.offset,
    }),
    prisma.routingRule.count({ where }),
  ]);

  return {
    rules: rules.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      priority: r.priority,
      isActive: r.isActive,
      criteria: r.criteria as RequestCriteria,
      handler: r.handler as RouteHandler,
    })),
    total,
  };
}

export default {
  matchRules,
  createRule,
  updateRule,
  deleteRule,
  getRules,
};
