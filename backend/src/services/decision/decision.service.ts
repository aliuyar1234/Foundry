/**
 * Decision Service (T063-T066)
 * Core service for decision archaeology and analysis
 */

import { PrismaClient, DecisionStatus } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { getAnthropicClient } from '../../lib/anthropic.js';
import { getEmbeddingService } from '../vector/embedding.service.js';
import { getQdrantService } from '../vector/qdrant.service.js';
import type {
  DecisionRecord,
  CreateDecisionRecordInput,
  UpdateDecisionRecordInput,
  DecisionRecordFilters,
  ExtractedDecision,
  DecisionImpactAnalysis,
  DecisionTimelineEntry,
  DecisionAlternative,
} from '../../models/DecisionRecord.js';

const prisma = new PrismaClient();

/**
 * Decision archaeology service
 */
export class DecisionService {
  private static instance: DecisionService;

  private constructor() {}

  static getInstance(): DecisionService {
    if (!DecisionService.instance) {
      DecisionService.instance = new DecisionService();
    }
    return DecisionService.instance;
  }

  /**
   * Create a new decision record
   */
  async createDecision(input: CreateDecisionRecordInput): Promise<DecisionRecord> {
    const decision = await prisma.decisionRecord.create({
      data: {
        tenantId: input.tenantId,
        title: input.title,
        description: input.description,
        context: input.context,
        alternatives: input.alternatives || [],
        outcome: input.outcome,
        rationale: input.rationale,
        status: input.status || 'DRAFT',
        confidence: input.confidence || 0.5,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceMetadata: input.sourceMetadata || {},
        decisionMakers: input.decisionMakers || [],
        stakeholders: input.stakeholders || [],
        impactAreas: input.impactAreas || [],
        tags: input.tags || [],
        decisionDate: input.decisionDate,
        effectiveDate: input.effectiveDate,
        reviewDate: input.reviewDate,
      },
    });

    logger.info({ decisionId: decision.id }, 'Decision record created');

    // Generate embedding for the decision
    await this.embedDecision(decision.id, input.tenantId);

    return this.mapToDecisionRecord(decision);
  }

  /**
   * Update a decision record
   */
  async updateDecision(
    id: string,
    input: UpdateDecisionRecordInput
  ): Promise<DecisionRecord | null> {
    const decision = await prisma.decisionRecord.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    if (input.title || input.description || input.context || input.rationale) {
      const existing = await prisma.decisionRecord.findUnique({ where: { id } });
      if (existing) {
        await this.embedDecision(id, existing.tenantId);
      }
    }

    return this.mapToDecisionRecord(decision);
  }

  /**
   * Get a decision by ID
   */
  async getDecision(id: string): Promise<DecisionRecord | null> {
    const decision = await prisma.decisionRecord.findUnique({
      where: { id },
    });

    return decision ? this.mapToDecisionRecord(decision) : null;
  }

  /**
   * Query decisions with filters
   */
  async queryDecisions(
    filters: DecisionRecordFilters,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ decisions: DecisionRecord[]; total: number }> {
    const where: Record<string, unknown> = {
      tenantId: filters.tenantId,
    };

    if (filters.status) where.status = filters.status;
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.minConfidence) where.confidence = { gte: filters.minConfidence };

    if (filters.decisionMaker) {
      where.decisionMakers = { has: filters.decisionMaker };
    }

    if (filters.impactArea) {
      where.impactAreas = { has: filters.impactArea };
    }

    if (filters.tag) {
      where.tags = { has: filters.tag };
    }

    if (filters.startDate || filters.endDate) {
      where.decisionDate = {};
      if (filters.startDate) (where.decisionDate as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.decisionDate as Record<string, Date>).lte = filters.endDate;
    }

    if (filters.searchText) {
      where.OR = [
        { title: { contains: filters.searchText, mode: 'insensitive' } },
        { description: { contains: filters.searchText, mode: 'insensitive' } },
      ];
    }

    const [decisions, total] = await Promise.all([
      prisma.decisionRecord.findMany({
        where,
        take: options.limit || 50,
        skip: options.offset || 0,
        orderBy: { decisionDate: 'desc' },
      }),
      prisma.decisionRecord.count({ where }),
    ]);

    return {
      decisions: decisions.map((d) => this.mapToDecisionRecord(d)),
      total,
    };
  }

  /**
   * Extract decisions from text using AI
   */
  async extractDecisions(
    text: string,
    sourceType: string,
    sourceId: string,
    tenantId: string
  ): Promise<ExtractedDecision[]> {
    const client = getAnthropicClient();

    const prompt = `Analyze the following text and extract any decisions that were made or discussed.
For each decision, provide:
- title: A concise title for the decision
- description: What was decided
- context: The background or reason for the decision
- alternatives: Other options that were considered (if mentioned)
- outcome: The result or chosen option
- rationale: Why this decision was made
- confidence: Your confidence in this extraction (0-1)
- decisionMakers: People involved in making the decision
- impactAreas: Areas affected by this decision
- decisionDate: When the decision was made (if mentioned, in ISO format)

Return as JSON array. If no decisions found, return empty array.

Text to analyze:
${text}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      // Extract JSON from response
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const extracted = JSON.parse(jsonMatch[0]) as ExtractedDecision[];

      logger.info(
        { count: extracted.length, sourceType, sourceId },
        'Extracted decisions from text'
      );

      return extracted;
    } catch (error) {
      logger.error({ error, sourceType, sourceId }, 'Failed to extract decisions');
      return [];
    }
  }

  /**
   * Create decisions from extraction results
   */
  async createFromExtraction(
    extracted: ExtractedDecision[],
    sourceType: string,
    sourceId: string,
    tenantId: string
  ): Promise<DecisionRecord[]> {
    const decisions: DecisionRecord[] = [];

    for (const ext of extracted) {
      const decision = await this.createDecision({
        tenantId,
        title: ext.title,
        description: ext.description,
        context: ext.context,
        alternatives: ext.alternatives?.map((a, i) => ({
          id: `alt-${i}`,
          ...a,
        })) as DecisionAlternative[],
        outcome: ext.outcome,
        rationale: ext.rationale,
        status: 'PENDING_REVIEW',
        confidence: ext.confidence,
        sourceType,
        sourceId,
        decisionMakers: ext.decisionMakers,
        impactAreas: ext.impactAreas,
        decisionDate: ext.decisionDate ? new Date(ext.decisionDate) : undefined,
      });

      decisions.push(decision);
    }

    return decisions;
  }

  /**
   * Analyze decision impact
   */
  async analyzeImpact(decisionId: string): Promise<DecisionImpactAnalysis | null> {
    const decision = await this.getDecision(decisionId);
    if (!decision) return null;

    const client = getAnthropicClient();

    // Get related data for context
    const relatedProcesses = await prisma.process.findMany({
      where: {
        tenantId: decision.tenantId,
        OR: decision.impactAreas.map((area) => ({
          name: { contains: area, mode: 'insensitive' as const },
        })),
      },
      take: 10,
    });

    const prompt = `Analyze the potential impact of this decision:

Decision: ${decision.title}
Description: ${decision.description}
Context: ${decision.context || 'Not provided'}
Rationale: ${decision.rationale || 'Not provided'}
Impact Areas: ${decision.impactAreas.join(', ')}
Decision Makers: ${decision.decisionMakers.join(', ')}

Related Processes: ${relatedProcesses.map((p) => p.name).join(', ')}

Provide an impact analysis including:
1. Risk score (0-100)
2. List of potentially affected processes
3. List of potentially affected roles/people
4. Summary of impact

Return as JSON with fields: riskScore, affectedProcesses, affectedRoles, impactSummary`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return null;
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        decisionId,
        affectedProcesses: analysis.affectedProcesses || [],
        affectedPeople: analysis.affectedRoles || [],
        affectedDocuments: [],
        upstreamDecisions: [],
        downstreamDecisions: [],
        riskScore: analysis.riskScore || 50,
        impactSummary: analysis.impactSummary || '',
      };
    } catch (error) {
      logger.error({ error, decisionId }, 'Failed to analyze decision impact');
      return null;
    }
  }

  /**
   * Get decision timeline for a tenant
   */
  async getTimeline(
    tenantId: string,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {}
  ): Promise<DecisionTimelineEntry[]> {
    const where: Record<string, unknown> = {
      tenantId,
      decisionDate: { not: null },
    };

    if (options.startDate || options.endDate) {
      where.decisionDate = {};
      if (options.startDate)
        (where.decisionDate as Record<string, Date>).gte = options.startDate;
      if (options.endDate)
        (where.decisionDate as Record<string, Date>).lte = options.endDate;
    }

    const decisions = await prisma.decisionRecord.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        decisionDate: true,
        confidence: true,
        impactAreas: true,
      },
      orderBy: { decisionDate: 'asc' },
      take: options.limit || 100,
    });

    return decisions.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      decisionDate: d.decisionDate,
      confidence: d.confidence,
      impactAreas: d.impactAreas,
    }));
  }

  /**
   * Find related decisions
   */
  async findRelatedDecisions(
    decisionId: string,
    limit: number = 5
  ): Promise<DecisionRecord[]> {
    const decision = await this.getDecision(decisionId);
    if (!decision) return [];

    // Search for similar decisions using vector similarity
    const qdrantService = getQdrantService();
    const embeddingService = getEmbeddingService();

    const searchText = `${decision.title} ${decision.description} ${decision.context || ''}`;
    const embedding = await embeddingService.generateEmbedding(searchText);

    const results = await qdrantService.search('decisions', embedding, limit + 1, {
      tenantId: decision.tenantId,
    });

    // Filter out the original decision
    const relatedIds = results
      .filter((r) => r.payload?.sourceId !== decisionId)
      .slice(0, limit)
      .map((r) => r.payload?.sourceId as string);

    if (relatedIds.length === 0) return [];

    const related = await prisma.decisionRecord.findMany({
      where: { id: { in: relatedIds } },
    });

    return related.map((d) => this.mapToDecisionRecord(d));
  }

  /**
   * Approve a decision
   */
  async approveDecision(id: string, approver: string): Promise<DecisionRecord | null> {
    return this.updateDecision(id, {
      status: 'APPROVED',
    });
  }

  /**
   * Reject a decision
   */
  async rejectDecision(id: string, reason: string): Promise<DecisionRecord | null> {
    return this.updateDecision(id, {
      status: 'REJECTED',
    });
  }

  /**
   * Generate embedding for a decision
   */
  private async embedDecision(decisionId: string, tenantId: string): Promise<void> {
    const decision = await prisma.decisionRecord.findUnique({
      where: { id: decisionId },
    });

    if (!decision) return;

    const embeddingService = getEmbeddingService();
    const text = `${decision.title}\n\n${decision.description}\n\n${decision.context || ''}\n\n${decision.rationale || ''}`;

    await embeddingService.createEmbedding({
      tenantId,
      sourceType: 'decision',
      sourceId: decisionId,
      content: text,
      metadata: {
        title: decision.title,
        status: decision.status,
        impactAreas: decision.impactAreas,
      },
    });
  }

  /**
   * Map Prisma model to DecisionRecord type
   */
  private mapToDecisionRecord(data: Record<string, unknown>): DecisionRecord {
    return {
      id: data.id as string,
      tenantId: data.tenantId as string,
      title: data.title as string,
      description: data.description as string,
      context: data.context as string | null,
      alternatives: (data.alternatives || []) as DecisionAlternative[],
      outcome: data.outcome as string | null,
      rationale: data.rationale as string | null,
      status: data.status as DecisionStatus,
      confidence: data.confidence as number,
      sourceType: data.sourceType as string,
      sourceId: data.sourceId as string | null,
      sourceMetadata: (data.sourceMetadata || {}) as Record<string, unknown>,
      decisionMakers: (data.decisionMakers || []) as string[],
      stakeholders: (data.stakeholders || []) as string[],
      impactAreas: (data.impactAreas || []) as string[],
      tags: (data.tags || []) as string[],
      decisionDate: data.decisionDate as Date | null,
      effectiveDate: data.effectiveDate as Date | null,
      reviewDate: data.reviewDate as Date | null,
      createdAt: data.createdAt as Date,
      updatedAt: data.updatedAt as Date,
    };
  }
}

/**
 * Get singleton instance
 */
export function getDecisionService(): DecisionService {
  return DecisionService.getInstance();
}
