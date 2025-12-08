/**
 * Optimization Service (T093-T097)
 * AI-powered process optimization detection and analysis
 */

import { OptimizationType, SuggestionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getAnthropicClient } from '../../lib/anthropic.js';
import type {
  OptimizationSuggestion,
  CreateOptimizationInput,
  UpdateOptimizationInput,
  OptimizationFilters,
  OptimizationDetectionRequest,
  BottleneckDetection,
  OptimizationAnalysis,
  OptimizationImpact,
  ImplementationPlan,
  calculateImpactScore,
  calculatePriorityScore,
} from '../../models/OptimizationSuggestion.js';

/**
 * Process optimization service
 */
export class OptimizationService {
  private static instance: OptimizationService;

  private constructor() {}

  static getInstance(): OptimizationService {
    if (!OptimizationService.instance) {
      OptimizationService.instance = new OptimizationService();
    }
    return OptimizationService.instance;
  }

  /**
   * Detect optimization opportunities for a process
   */
  async detectOptimizations(
    request: OptimizationDetectionRequest
  ): Promise<OptimizationSuggestion[]> {
    const { processId, tenantId, options = {} } = request;

    // Get process with related data
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

    // Get process metrics and history
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        processes: { some: { id: processId } },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    // Detect bottlenecks
    const bottlenecks = await this.detectBottlenecks(process, events);

    // Run AI analysis for each optimization type
    const types = options.types || [
      'BOTTLENECK',
      'AUTOMATION',
      'CONSOLIDATION',
      'PARALLELIZATION',
      'ELIMINATION',
    ];

    const suggestions: OptimizationSuggestion[] = [];

    for (const type of types) {
      const typeSuggestions = await this.analyzeForOptimizationType(
        process,
        events,
        bottlenecks,
        type as OptimizationType,
        tenantId,
        options
      );
      suggestions.push(...typeSuggestions);
    }

    // Sort by priority
    suggestions.sort((a, b) => b.priority - a.priority);

    logger.info(
      { processId, suggestionCount: suggestions.length },
      'Detected optimization opportunities'
    );

    return suggestions;
  }

  /**
   * Create an optimization suggestion
   */
  async createSuggestion(input: CreateOptimizationInput): Promise<OptimizationSuggestion> {
    const { calculateImpactScore: calcImpact, calculatePriorityScore: calcPriority } =
      await import('../../models/OptimizationSuggestion.js');

    const impactScore = calcImpact(input.impact);
    const priority =
      input.priority ||
      calcPriority(impactScore, input.implementation.effort, input.confidence || 0.7);

    const suggestion = await prisma.optimizationSuggestion.create({
      data: {
        tenantId: input.tenantId,
        processId: input.processId,
        type: input.type,
        status: 'PENDING',
        title: input.title,
        description: input.description,
        analysis: input.analysis as Record<string, unknown>,
        impact: input.impact as Record<string, unknown>,
        implementation: input.implementation as Record<string, unknown>,
        priority,
        confidence: input.confidence || 0.7,
      },
    });

    return this.mapToOptimizationSuggestion(suggestion);
  }

  /**
   * Update an optimization suggestion
   */
  async updateSuggestion(
    id: string,
    input: UpdateOptimizationInput
  ): Promise<OptimizationSuggestion | null> {
    const existing = await prisma.optimizationSuggestion.findUnique({ where: { id } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.status) updateData.status = input.status;
    if (input.title) updateData.title = input.title;
    if (input.description) updateData.description = input.description;
    if (input.priority !== undefined) updateData.priority = input.priority;

    if (input.status === 'APPROVED') {
      updateData.reviewedAt = new Date();
      if (input.reviewedBy) updateData.reviewedBy = input.reviewedBy;
    }

    if (input.status === 'IMPLEMENTED') {
      updateData.implementedAt = new Date();
    }

    if (input.analysis) {
      updateData.analysis = { ...(existing.analysis as object), ...input.analysis };
    }

    if (input.impact) {
      updateData.impact = { ...(existing.impact as object), ...input.impact };
    }

    if (input.implementation) {
      updateData.implementation = {
        ...(existing.implementation as object),
        ...input.implementation,
      };
    }

    const suggestion = await prisma.optimizationSuggestion.update({
      where: { id },
      data: updateData,
    });

    return this.mapToOptimizationSuggestion(suggestion);
  }

  /**
   * Get suggestion by ID
   */
  async getSuggestion(id: string): Promise<OptimizationSuggestion | null> {
    const suggestion = await prisma.optimizationSuggestion.findUnique({
      where: { id },
    });

    return suggestion ? this.mapToOptimizationSuggestion(suggestion) : null;
  }

  /**
   * Query suggestions with filters
   */
  async querySuggestions(
    filters: OptimizationFilters,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ suggestions: OptimizationSuggestion[]; total: number }> {
    const where: Record<string, unknown> = {
      tenantId: filters.tenantId,
    };

    if (filters.processId) where.processId = filters.processId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.minPriority) where.priority = { gte: filters.minPriority };
    if (filters.minConfidence) where.confidence = { gte: filters.minConfidence };

    const [suggestions, total] = await Promise.all([
      prisma.optimizationSuggestion.findMany({
        where,
        take: options.limit || 50,
        skip: options.offset || 0,
        orderBy: { priority: 'desc' },
      }),
      prisma.optimizationSuggestion.count({ where }),
    ]);

    return {
      suggestions: suggestions.map((s) => this.mapToOptimizationSuggestion(s)),
      total,
    };
  }

  /**
   * Approve a suggestion
   */
  async approveSuggestion(
    id: string,
    reviewer: string
  ): Promise<OptimizationSuggestion | null> {
    return this.updateSuggestion(id, {
      status: 'APPROVED',
      reviewedBy: reviewer,
    });
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(id: string, reviewer: string): Promise<OptimizationSuggestion | null> {
    return this.updateSuggestion(id, {
      status: 'REJECTED',
      reviewedBy: reviewer,
    });
  }

  /**
   * Mark suggestion as implemented
   */
  async markImplemented(id: string): Promise<OptimizationSuggestion | null> {
    return this.updateSuggestion(id, {
      status: 'IMPLEMENTED',
    });
  }

  /**
   * Detect bottlenecks in a process
   */
  async detectBottlenecks(
    process: Record<string, unknown>,
    events: Record<string, unknown>[]
  ): Promise<BottleneckDetection[]> {
    const bottlenecks: BottleneckDetection[] = [];

    // Analyze step durations
    const stepDurations: Record<string, number[]> = {};
    const steps = (process.steps || []) as Array<{ id: string; name: string }>;

    steps.forEach((step) => {
      stepDurations[step.id] = [];
    });

    // Calculate average durations per step from events
    events.forEach((event) => {
      const metadata = event.metadata as Record<string, unknown>;
      if (metadata?.stepId && metadata?.duration) {
        const stepId = metadata.stepId as string;
        if (stepDurations[stepId]) {
          stepDurations[stepId].push(metadata.duration as number);
        }
      }
    });

    // Identify steps with high variance or long durations
    Object.entries(stepDurations).forEach(([stepId, durations]) => {
      if (durations.length < 5) return;

      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance =
        durations.reduce((acc, d) => acc + Math.pow(d - avg, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      // High variance indicates inconsistency
      if (stdDev / avg > 0.5) {
        const step = steps.find((s) => s.id === stepId);
        bottlenecks.push({
          processId: process.id as string,
          stepId,
          severity: stdDev / avg > 1 ? 'high' : 'medium',
          type: 'rework',
          description: `Step "${step?.name}" has high duration variance (${Math.round(stdDev)}ms std dev)`,
          metrics: {
            averageWaitTime: avg,
            reworkRate: stdDev / avg,
          },
          suggestedFixes: [
            'Standardize the process for this step',
            'Provide additional training or documentation',
            'Review for automation opportunities',
          ],
        });
      }
    });

    return bottlenecks;
  }

  /**
   * Analyze process for specific optimization type
   */
  private async analyzeForOptimizationType(
    process: Record<string, unknown>,
    events: Record<string, unknown>[],
    bottlenecks: BottleneckDetection[],
    type: OptimizationType,
    tenantId: string,
    options: Record<string, unknown>
  ): Promise<OptimizationSuggestion[]> {
    const client = getAnthropicClient();

    const typePrompts: Record<OptimizationType, string> = {
      BOTTLENECK: 'Identify bottlenecks and delays in the process',
      AUTOMATION: 'Find opportunities to automate manual or repetitive tasks',
      CONSOLIDATION: 'Find steps that could be combined or streamlined',
      PARALLELIZATION: 'Identify steps that could run in parallel instead of sequentially',
      ELIMINATION: 'Find unnecessary steps or redundant activities that could be removed',
      STANDARDIZATION: 'Identify inconsistencies that need standardization',
      OTHER: 'Find other optimization opportunities',
    };

    const steps = (process.steps || []) as Array<{ name: string; description?: string }>;
    const context = `
Process: ${process.name}
Description: ${process.description || 'Not provided'}
Steps: ${steps.map((s, i) => `${i + 1}. ${s.name}: ${s.description || ''}`).join('\n')}
Recent Events Summary: ${events.length} events recorded
Known Bottlenecks: ${bottlenecks.map((b) => b.description).join('; ') || 'None identified'}
${options.customCriteria ? `Custom criteria: ${options.customCriteria}` : ''}
`;

    const prompt = `Analyze this process and ${typePrompts[type]}.

${context}

For each optimization opportunity found, provide:
1. Title: Brief description of the optimization
2. Description: Detailed explanation
3. CurrentState: How things work now
4. ProposedState: How things should work after optimization
5. Rationale: Why this change would help
6. Impact: Estimated improvements (time, cost, quality)
7. Effort: Low, Medium, or High
8. Confidence: 0-1 score for how certain you are

Return as JSON array. If no opportunities found for this type, return empty array.

Format:
[{
  "title": "...",
  "description": "...",
  "currentState": "...",
  "proposedState": "...",
  "rationale": "...",
  "impact": {
    "timeReduction": { "value": 20, "unit": "percent", "confidence": 0.8 },
    "costReduction": { "value": 10, "unit": "percent", "confidence": 0.7 }
  },
  "effort": "medium",
  "confidence": 0.8,
  "steps": ["Step 1", "Step 2"]
}]`;

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

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const opportunities = JSON.parse(jsonMatch[0]);
      const suggestions: OptimizationSuggestion[] = [];

      for (const opp of opportunities) {
        const suggestion = await this.createSuggestion({
          tenantId,
          processId: process.id as string,
          type,
          title: opp.title,
          description: opp.description,
          analysis: {
            currentState: opp.currentState,
            proposedState: opp.proposedState,
            rationale: opp.rationale,
            evidence: [],
            risks: [],
            assumptions: [],
            constraints: [],
          },
          impact: {
            ...opp.impact,
            overallScore: 0,
            affectedProcesses: [process.id as string],
            affectedRoles: [],
          },
          implementation: {
            steps: (opp.steps || []).map((s: string, i: number) => ({
              id: `step-${i + 1}`,
              order: i + 1,
              title: s,
              description: s,
            })),
            prerequisites: [],
            resources: [],
            timeline: 'TBD',
            effort: opp.effort || 'medium',
            complexity: opp.effort || 'medium',
          },
          confidence: opp.confidence || 0.7,
        });

        suggestions.push(suggestion);
      }

      return suggestions;
    } catch (error) {
      logger.error({ error, type, processId: process.id }, 'Failed to analyze for optimization');
      return [];
    }
  }

  /**
   * Map Prisma model to OptimizationSuggestion type
   */
  private mapToOptimizationSuggestion(data: Record<string, unknown>): OptimizationSuggestion {
    return {
      id: data.id as string,
      tenantId: data.tenantId as string,
      processId: data.processId as string,
      type: data.type as OptimizationType,
      status: data.status as SuggestionStatus,
      title: data.title as string,
      description: data.description as string,
      analysis: (data.analysis || {}) as OptimizationAnalysis,
      impact: (data.impact || {}) as OptimizationImpact,
      implementation: (data.implementation || {}) as ImplementationPlan,
      priority: data.priority as number,
      confidence: data.confidence as number,
      createdAt: data.createdAt as Date,
      updatedAt: data.updatedAt as Date,
      reviewedAt: data.reviewedAt as Date | null,
      reviewedBy: data.reviewedBy as string | null,
      implementedAt: data.implementedAt as Date | null,
    };
  }
}

/**
 * Get singleton instance
 */
export function getOptimizationService(): OptimizationService {
  return OptimizationService.getInstance();
}
