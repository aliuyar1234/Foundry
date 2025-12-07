/**
 * Context Retriever Service
 * T066 - Create knowledge graph context retriever
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { getDriver } from '../../graph/driver.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface RetrievedContext {
  type: 'process' | 'person' | 'document' | 'decision' | 'relationship' | 'metric';
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  source: string;
  metadata: Record<string, unknown>;
}

export interface ContextQuery {
  query: string;
  organizationId: string;
  userId?: string;
  contextTypes?: RetrievedContext['type'][];
  limit?: number;
  minRelevance?: number;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Retrieve relevant context for a query
 */
export async function retrieveContext(
  query: ContextQuery
): Promise<RetrievedContext[]> {
  const {
    query: searchQuery,
    organizationId,
    contextTypes = ['process', 'person', 'document', 'decision'],
    limit = 10,
    minRelevance = 0.3,
  } = query;

  logger.debug({ searchQuery, organizationId, contextTypes }, 'Retrieving context');

  const results: RetrievedContext[] = [];

  // Extract key terms from query
  const keywords = extractKeywords(searchQuery);

  // Parallel context retrieval
  const retrievalPromises: Promise<RetrievedContext[]>[] = [];

  if (contextTypes.includes('process')) {
    retrievalPromises.push(retrieveProcessContext(organizationId, keywords, limit));
  }

  if (contextTypes.includes('person')) {
    retrievalPromises.push(retrievePersonContext(organizationId, keywords, limit));
  }

  if (contextTypes.includes('document')) {
    retrievalPromises.push(retrieveDocumentContext(organizationId, keywords, limit));
  }

  if (contextTypes.includes('decision')) {
    retrievalPromises.push(retrieveDecisionContext(organizationId, keywords, limit));
  }

  if (contextTypes.includes('relationship')) {
    retrievalPromises.push(retrieveRelationshipContext(organizationId, keywords, limit));
  }

  const allResults = await Promise.all(retrievalPromises);
  for (const contextResults of allResults) {
    results.push(...contextResults);
  }

  // Filter by minimum relevance and sort by score
  return results
    .filter(r => r.relevanceScore >= minRelevance)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/**
 * Extract keywords from query
 */
function extractKeywords(query: string): string[] {
  // Simple keyword extraction - in production, use NLP
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'what', 'who', 'how', 'when', 'where', 'why', 'which',
    'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'war', 'waren',
    'wer', 'was', 'wie', 'wann', 'wo', 'warum', 'welche',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Retrieve process-related context
 */
async function retrieveProcessContext(
  organizationId: string,
  keywords: string[],
  limit: number
): Promise<RetrievedContext[]> {
  const driver = getDriver();
  const session = driver.session();

  try {
    // Search processes in Neo4j
    const result = await session.run(
      `
      MATCH (p:Process {organizationId: $organizationId})
      WHERE ANY(kw IN $keywords WHERE
        toLower(p.name) CONTAINS kw OR
        toLower(p.description) CONTAINS kw OR
        ANY(step IN p.steps WHERE toLower(step) CONTAINS kw)
      )
      OPTIONAL MATCH (p)-[:INVOLVES]->(person:Person)
      OPTIONAL MATCH (p)-[:BELONGS_TO]->(dept:Department)
      RETURN p, collect(DISTINCT person.name) as participants, dept.name as department
      LIMIT $limit
      `,
      { organizationId, keywords, limit }
    );

    return result.records.map(record => {
      const process = record.get('p').properties;
      const participants = record.get('participants') || [];
      const department = record.get('department');

      const relevance = calculateRelevance(
        [process.name, process.description || ''].join(' '),
        keywords
      );

      return {
        type: 'process' as const,
        id: process.id,
        title: process.name,
        content: [
          process.description || '',
          `Participants: ${participants.join(', ') || 'None specified'}`,
          department ? `Department: ${department}` : '',
        ].filter(Boolean).join('\n'),
        relevanceScore: relevance,
        source: 'knowledge_graph',
        metadata: {
          department,
          participants,
          status: process.status,
        },
      };
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve process context');
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Retrieve person-related context
 */
async function retrievePersonContext(
  organizationId: string,
  keywords: string[],
  limit: number
): Promise<RetrievedContext[]> {
  try {
    // Search expertise profiles
    const profiles = await prisma.expertiseProfile.findMany({
      where: {
        organizationId,
        OR: keywords.map(kw => ({
          OR: [
            { personName: { contains: kw, mode: 'insensitive' as const } },
            { skillsJson: { contains: kw } },
          ],
        })),
      },
      take: limit,
    });

    return profiles.map(profile => {
      const skills = profile.skills as Array<{ name: string; level: number }> || [];
      const relevance = calculateRelevance(
        [profile.personName, ...skills.map(s => s.name)].join(' '),
        keywords
      );

      return {
        type: 'person' as const,
        id: profile.personId,
        title: profile.personName,
        content: [
          `Skills: ${skills.map(s => `${s.name} (Level ${s.level})`).join(', ') || 'None'}`,
          profile.email ? `Email: ${profile.email}` : '',
        ].filter(Boolean).join('\n'),
        relevanceScore: relevance,
        source: 'expertise_profile',
        metadata: {
          skills,
          email: profile.email,
        },
      };
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve person context');
    return [];
  }
}

/**
 * Retrieve document-related context
 */
async function retrieveDocumentContext(
  organizationId: string,
  keywords: string[],
  limit: number
): Promise<RetrievedContext[]> {
  // In a full implementation, this would search indexed documents
  // For now, return empty array - would integrate with document store
  logger.debug({ organizationId, keywords }, 'Document context retrieval (stub)');
  return [];
}

/**
 * Retrieve decision-related context
 */
async function retrieveDecisionContext(
  organizationId: string,
  keywords: string[],
  limit: number
): Promise<RetrievedContext[]> {
  try {
    const decisions = await prisma.routingDecision.findMany({
      where: {
        organizationId,
        OR: [
          { requestType: { in: keywords } },
          { requestCategories: { hasSome: keywords } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return decisions.map(decision => ({
      type: 'decision' as const,
      id: decision.id,
      title: `Routing Decision: ${decision.requestType}`,
      content: [
        `Categories: ${decision.requestCategories.join(', ')}`,
        `Handler: ${decision.selectedHandlerId} (${decision.selectedHandlerType})`,
        `Confidence: ${(decision.confidence * 100).toFixed(0)}%`,
        decision.wasEscalated ? 'Was escalated' : '',
      ].filter(Boolean).join('\n'),
      relevanceScore: calculateRelevance(
        [decision.requestType, ...decision.requestCategories].join(' '),
        keywords
      ),
      source: 'routing_decisions',
      metadata: {
        confidence: decision.confidence,
        handlerType: decision.selectedHandlerType,
        wasEscalated: decision.wasEscalated,
      },
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve decision context');
    return [];
  }
}

/**
 * Retrieve relationship context from knowledge graph
 */
async function retrieveRelationshipContext(
  organizationId: string,
  keywords: string[],
  limit: number
): Promise<RetrievedContext[]> {
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (a)-[r]-(b)
      WHERE (a:Person OR a:Process OR a:Department)
        AND a.organizationId = $organizationId
        AND (
          ANY(kw IN $keywords WHERE toLower(a.name) CONTAINS kw) OR
          ANY(kw IN $keywords WHERE toLower(b.name) CONTAINS kw)
        )
      RETURN a.name as source, type(r) as relationship, b.name as target,
             labels(a) as sourceLabels, labels(b) as targetLabels
      LIMIT $limit
      `,
      { organizationId, keywords, limit }
    );

    return result.records.map(record => {
      const source = record.get('source');
      const relationship = record.get('relationship');
      const target = record.get('target');
      const sourceLabels = record.get('sourceLabels');
      const targetLabels = record.get('targetLabels');

      return {
        type: 'relationship' as const,
        id: `${source}-${relationship}-${target}`,
        title: `${source} → ${target}`,
        content: `${source} (${sourceLabels[0]}) ${relationship.replace(/_/g, ' ')} ${target} (${targetLabels[0]})`,
        relevanceScore: 0.6,
        source: 'knowledge_graph',
        metadata: {
          sourceType: sourceLabels[0],
          targetType: targetLabels[0],
          relationshipType: relationship,
        },
      };
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve relationship context');
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Calculate relevance score
 */
function calculateRelevance(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let matches = 0;

  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      matches++;
    }
  }

  return keywords.length > 0 ? matches / keywords.length : 0;
}

export default {
  retrieveContext,
  extractKeywords,
};
