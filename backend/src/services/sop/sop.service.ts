/**
 * SOP Generation Service (T078-T082)
 * Core service for automated SOP generation and management
 */

import { PrismaClient, SopDraftStatus } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { getAnthropicClient } from '../../lib/anthropic.js';
import { getEmbeddingService } from '../vector/embedding.service.js';
import type {
  SopDraft,
  SopContent,
  SopMetadata,
  SopGenerationParams,
  SopGenerationRequest,
  CreateSopDraftInput,
  UpdateSopDraftInput,
  SopProcedure,
  SopResponsibility,
  SopQualityCheck,
  SopException,
  SopReviewEntry,
  incrementVersion,
  calculateCompletenessScore,
} from '../../models/SopDraft.js';

const prisma = new PrismaClient();

/**
 * SOP generation and management service
 */
export class SopService {
  private static instance: SopService;

  private constructor() {}

  static getInstance(): SopService {
    if (!SopService.instance) {
      SopService.instance = new SopService();
    }
    return SopService.instance;
  }

  /**
   * Generate SOP for a process
   */
  async generateSop(request: SopGenerationRequest): Promise<SopDraft> {
    const { processId, tenantId, options = {} } = request;

    // Get process details
    const process = await prisma.process.findUnique({
      where: { id: processId },
      include: {
        steps: { orderBy: { order: 'asc' } },
        owner: true,
      },
    });

    if (!process) {
      throw new Error(`Process not found: ${processId}`);
    }

    // Get related events for context
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: processId } },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Get related decisions
    const decisions = options.includeDecisions
      ? await prisma.decisionRecord.findMany({
          where: {
            tenantId,
            impactAreas: { hasSome: [process.name] },
            status: 'APPROVED',
          },
          take: 10,
        })
      : [];

    // Build generation context
    const context = this.buildGenerationContext(process, events, decisions);

    // Generate SOP content using AI
    const content = await this.generateSopContent(
      process.name,
      context,
      options.detailLevel || 'standard',
      options.customInstructions
    );

    // Create SOP draft
    const draft = await this.createDraft({
      tenantId,
      processId,
      title: `SOP: ${process.name}`,
      content,
      metadata: {
        author: 'AI Generated',
        department: process.department || undefined,
        category: process.category || undefined,
        tags: process.tags || [],
        approvers: process.owner ? [process.owner.name] : [],
      },
      generationParams: {
        sourceEvents: events.map((e) => e.id),
        sourceDocuments: [],
        sourceDecisions: decisions.map((d) => d.id),
        modelUsed: 'claude-sonnet-4-20250514',
        temperature: 0.3,
        focusAreas: options.focusAreas,
        detailLevel: options.detailLevel || 'standard',
      },
    });

    logger.info(
      { sopId: draft.id, processId, eventCount: events.length },
      'Generated SOP draft'
    );

    return draft;
  }

  /**
   * Create a new SOP draft
   */
  async createDraft(input: CreateSopDraftInput): Promise<SopDraft> {
    const draft = await prisma.sopDraft.create({
      data: {
        tenantId: input.tenantId,
        processId: input.processId,
        title: input.title,
        version: '1.0.0',
        status: 'DRAFT',
        content: input.content as Record<string, unknown>,
        metadata: input.metadata as Record<string, unknown>,
        generationParams: input.generationParams as Record<string, unknown>,
        reviewHistory: [],
      },
    });

    // Generate embedding for the SOP
    await this.embedSop(draft.id, input.tenantId);

    return this.mapToSopDraft(draft);
  }

  /**
   * Update an SOP draft
   */
  async updateDraft(id: string, input: UpdateSopDraftInput): Promise<SopDraft | null> {
    const existing = await prisma.sopDraft.findUnique({ where: { id } });
    if (!existing) return null;

    const updatedContent = input.content
      ? { ...(existing.content as object), ...input.content }
      : existing.content;

    const updatedMetadata = input.metadata
      ? { ...(existing.metadata as object), ...input.metadata }
      : existing.metadata;

    const draft = await prisma.sopDraft.update({
      where: { id },
      data: {
        title: input.title,
        content: updatedContent as Record<string, unknown>,
        metadata: updatedMetadata as Record<string, unknown>,
        status: input.status,
        updatedAt: new Date(),
      },
    });

    if (input.content) {
      await this.embedSop(id, existing.tenantId);
    }

    return this.mapToSopDraft(draft);
  }

  /**
   * Get SOP draft by ID
   */
  async getDraft(id: string): Promise<SopDraft | null> {
    const draft = await prisma.sopDraft.findUnique({
      where: { id },
    });

    return draft ? this.mapToSopDraft(draft) : null;
  }

  /**
   * Get SOPs for a process
   */
  async getSopsForProcess(processId: string): Promise<SopDraft[]> {
    const drafts = await prisma.sopDraft.findMany({
      where: { processId },
      orderBy: { createdAt: 'desc' },
    });

    return drafts.map((d) => this.mapToSopDraft(d));
  }

  /**
   * Submit SOP for review
   */
  async submitForReview(id: string, submitter: string): Promise<SopDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft) return null;

    const reviewEntry: SopReviewEntry = {
      id: `review-${Date.now()}`,
      reviewer: submitter,
      action: 'comment',
      comments: 'Submitted for review',
      timestamp: new Date(),
    };

    return this.updateDraftWithReview(id, 'PENDING_REVIEW', reviewEntry);
  }

  /**
   * Approve SOP draft
   */
  async approveDraft(
    id: string,
    approver: string,
    comments?: string
  ): Promise<SopDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft) return null;

    const reviewEntry: SopReviewEntry = {
      id: `review-${Date.now()}`,
      reviewer: approver,
      action: 'approve',
      comments: comments || 'Approved',
      timestamp: new Date(),
    };

    return this.updateDraftWithReview(id, 'APPROVED', reviewEntry);
  }

  /**
   * Reject SOP draft
   */
  async rejectDraft(
    id: string,
    reviewer: string,
    reason: string
  ): Promise<SopDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft) return null;

    const reviewEntry: SopReviewEntry = {
      id: `review-${Date.now()}`,
      reviewer,
      action: 'reject',
      comments: reason,
      timestamp: new Date(),
    };

    return this.updateDraftWithReview(id, 'REJECTED', reviewEntry);
  }

  /**
   * Publish an approved SOP
   */
  async publishDraft(id: string): Promise<SopDraft | null> {
    const draft = await this.getDraft(id);
    if (!draft || draft.status !== 'APPROVED') {
      return null;
    }

    const published = await prisma.sopDraft.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info({ sopId: id }, 'SOP published');

    return this.mapToSopDraft(published);
  }

  /**
   * Create new version of an SOP
   */
  async createNewVersion(
    id: string,
    versionType: 'major' | 'minor' | 'patch' = 'minor'
  ): Promise<SopDraft | null> {
    const existing = await this.getDraft(id);
    if (!existing) return null;

    const { incrementVersion: incVersion } = await import('../../models/SopDraft.js');
    const newVersion = incVersion(existing.version, versionType);

    const newDraft = await this.createDraft({
      tenantId: existing.tenantId,
      processId: existing.processId,
      title: existing.title,
      content: existing.content,
      metadata: {
        ...existing.metadata,
        author: 'System',
      },
      generationParams: existing.generationParams,
    });

    await prisma.sopDraft.update({
      where: { id: newDraft.id },
      data: { version: newVersion },
    });

    return this.getDraft(newDraft.id);
  }

  /**
   * Generate SOP content using AI
   */
  private async generateSopContent(
    processName: string,
    context: string,
    detailLevel: 'summary' | 'standard' | 'detailed',
    customInstructions?: string
  ): Promise<SopContent> {
    const client = getAnthropicClient();

    const detailInstructions = {
      summary: 'Provide a concise overview with key steps only.',
      standard: 'Include all essential steps with moderate detail.',
      detailed:
        'Provide comprehensive documentation with detailed substeps, notes, and warnings.',
    };

    const prompt = `Generate a Standard Operating Procedure (SOP) for the process: "${processName}"

Based on the following context:
${context}

${detailInstructions[detailLevel]}
${customInstructions ? `\nAdditional instructions: ${customInstructions}` : ''}

Return a JSON object with this structure:
{
  "purpose": "Purpose of this SOP",
  "scope": "What this SOP covers and doesn't cover",
  "definitions": [{"term": "...", "definition": "..."}],
  "responsibilities": [{"role": "...", "responsibilities": ["..."]}],
  "prerequisites": ["..."],
  "procedures": [{
    "id": "step-1",
    "stepNumber": 1,
    "title": "...",
    "description": "...",
    "substeps": [{"id": "1.1", "stepNumber": "1.1", "description": "..."}],
    "responsible": "Role name",
    "duration": "5 minutes",
    "tools": ["..."],
    "inputs": ["..."],
    "outputs": ["..."],
    "notes": ["..."],
    "warnings": ["..."]
  }],
  "qualityChecks": [{"id": "qc-1", "checkpoint": "...", "criteria": "...", "frequency": "...", "responsible": "..."}],
  "exceptions": [{"id": "exc-1", "condition": "...", "action": "...", "escalation": "..."}],
  "references": [{"id": "ref-1", "title": "...", "type": "...", "location": "..."}],
  "revisionHistory": [{"version": "1.0.0", "date": "${new Date().toISOString().split('T')[0]}", "author": "AI", "changes": "Initial generation"}]
}`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Invalid response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      return JSON.parse(jsonMatch[0]) as SopContent;
    } catch (error) {
      logger.error({ error, processName }, 'Failed to generate SOP content');

      // Return minimal valid structure
      return {
        purpose: `Standard Operating Procedure for ${processName}`,
        scope: 'To be defined',
        definitions: [],
        responsibilities: [],
        prerequisites: [],
        procedures: [],
        qualityChecks: [],
        exceptions: [],
        references: [],
        revisionHistory: [
          {
            version: '1.0.0',
            date: new Date().toISOString().split('T')[0],
            author: 'System',
            changes: 'Initial creation - pending content',
          },
        ],
      };
    }
  }

  /**
   * Build context for SOP generation
   */
  private buildGenerationContext(
    process: Record<string, unknown>,
    events: Record<string, unknown>[],
    decisions: Record<string, unknown>[]
  ): string {
    const parts: string[] = [];

    // Process info
    parts.push(`Process Name: ${process.name}`);
    parts.push(`Description: ${process.description || 'Not provided'}`);

    // Steps
    const steps = (process.steps || []) as Array<{ name: string; description?: string }>;
    if (steps.length > 0) {
      parts.push('\nProcess Steps:');
      steps.forEach((step, i) => {
        parts.push(`${i + 1}. ${step.name}: ${step.description || ''}`);
      });
    }

    // Recent events (patterns)
    if (events.length > 0) {
      parts.push('\nRecent Activity Patterns:');
      const eventSummary = events.slice(0, 20).map((e) => e.description).join('\n');
      parts.push(eventSummary);
    }

    // Related decisions
    if (decisions.length > 0) {
      parts.push('\nRelevant Decisions:');
      decisions.forEach((d) => {
        parts.push(`- ${d.title}: ${d.description}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Update draft with review entry
   */
  private async updateDraftWithReview(
    id: string,
    status: SopDraftStatus,
    reviewEntry: SopReviewEntry
  ): Promise<SopDraft | null> {
    const existing = await prisma.sopDraft.findUnique({ where: { id } });
    if (!existing) return null;

    const history = (existing.reviewHistory || []) as SopReviewEntry[];
    history.push(reviewEntry);

    const updated = await prisma.sopDraft.update({
      where: { id },
      data: {
        status,
        reviewHistory: history as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      },
    });

    return this.mapToSopDraft(updated);
  }

  /**
   * Generate embedding for SOP
   */
  private async embedSop(sopId: string, tenantId: string): Promise<void> {
    const sop = await prisma.sopDraft.findUnique({ where: { id: sopId } });
    if (!sop) return;

    const content = sop.content as SopContent;
    const text = `${sop.title}\n\n${content.purpose}\n\n${content.scope}\n\n${content.procedures?.map((p) => `${p.title}: ${p.description}`).join('\n') || ''}`;

    const embeddingService = getEmbeddingService();
    await embeddingService.createEmbedding({
      tenantId,
      sourceType: 'sop',
      sourceId: sopId,
      content: text,
      metadata: {
        title: sop.title,
        processId: sop.processId,
        version: sop.version,
        status: sop.status,
      },
    });
  }

  /**
   * Map Prisma model to SopDraft type
   */
  private mapToSopDraft(data: Record<string, unknown>): SopDraft {
    return {
      id: data.id as string,
      tenantId: data.tenantId as string,
      processId: data.processId as string,
      title: data.title as string,
      version: data.version as string,
      status: data.status as SopDraftStatus,
      content: (data.content || {}) as SopContent,
      metadata: (data.metadata || {}) as SopMetadata,
      generationParams: (data.generationParams || {}) as SopGenerationParams,
      reviewHistory: (data.reviewHistory || []) as SopReviewEntry[],
      createdAt: data.createdAt as Date,
      updatedAt: data.updatedAt as Date,
      publishedAt: data.publishedAt as Date | null,
    };
  }
}

/**
 * Get singleton instance
 */
export function getSopService(): SopService {
  return SopService.getInstance();
}
