/**
 * SOP Generation Job Processor
 * Processes SOP generation jobs asynchronously
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { BaseProcessor } from './baseProcessor.js';
import {
  SOPGenerator,
  createSOPGenerator,
  SOPGenerationResult,
} from '../../services/reporting/sop/sopGenerator.js';
import { SOPGenerationOptions } from '../../services/reporting/sop/prompts/sopTemplates.js';
import { ProcessData, enrichProcessData, validateProcessData } from '../../services/reporting/sop/inputFormatter.js';

export interface SOPGenerationJobData {
  organizationId: string;
  processId: string;
  userId: string;
  options: Partial<SOPGenerationOptions>;
  processData?: ProcessData;
}

export interface SOPGenerationJobResult {
  sopId: string;
  title: string;
  processId: string;
  processName: string;
  version: string;
  confidence: number;
  warnings: string[];
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  generationTimeMs: number;
}

export class SOPGenerationProcessor extends BaseProcessor<
  SOPGenerationJobData,
  SOPGenerationJobResult
> {
  private prisma: PrismaClient;
  private sopGenerator: SOPGenerator;

  constructor() {
    super('sop-generation');
    this.prisma = new PrismaClient();
    this.sopGenerator = createSOPGenerator();
  }

  async process(job: Job<SOPGenerationJobData>): Promise<SOPGenerationJobResult> {
    const {
      organizationId,
      processId,
      userId,
      options,
      processData: providedProcessData,
    } = job.data;

    await this.updateProgress(job, 0, 'Starting SOP generation');

    // Fetch process data if not provided
    let processData: ProcessData;
    if (providedProcessData) {
      processData = providedProcessData;
    } else {
      await this.updateProgress(job, 10, 'Fetching process data');
      processData = await this.fetchProcessData(organizationId, processId);
    }

    // Validate and enrich process data
    await this.updateProgress(job, 20, 'Validating process data');
    const validation = validateProcessData(processData);

    if (!validation.isValid) {
      throw new Error(`Invalid process data: ${validation.errors.join(', ')}`);
    }

    // Enrich process data with calculated fields
    processData = enrichProcessData(processData);

    // Generate SOP
    await this.updateProgress(job, 30, 'Generating SOP content');

    const result = await this.sopGenerator.generateSOP(processData, options);

    await this.updateProgress(job, 80, 'Saving SOP');

    // Save SOP to database
    const sop = await this.saveSOP(organizationId, userId, processId, result, options);

    await this.updateProgress(job, 100, 'SOP generation complete');

    return {
      sopId: sop.id,
      title: result.title,
      processId: result.processId,
      processName: result.processName,
      version: result.version,
      confidence: result.confidence.overall,
      warnings: result.warnings,
      tokenUsage: result.tokenUsage,
      generationTimeMs: result.metadata.generationTimeMs,
    };
  }

  /**
   * Fetch process data from database
   */
  private async fetchProcessData(organizationId: string, processId: string): Promise<ProcessData> {
    // Fetch process from database
    const process = await this.prisma.discoveredProcess.findFirst({
      where: {
        id: processId,
        organizationId,
      },
      include: {
        steps: {
          include: {
            performer: true,
          },
        },
        variants: true,
      },
    });

    if (!process) {
      throw new Error(`Process not found: ${processId}`);
    }

    // Transform to ProcessData format
    const processData: ProcessData = {
      id: process.id,
      name: process.name,
      description: process.description || undefined,
      organizationId: process.organizationId,
      steps: process.steps.map((step) => ({
        id: step.id,
        name: step.name,
        description: step.description || undefined,
        type: step.type,
        performer: step.performer
          ? {
              id: step.performer.id,
              name: step.performer.name,
              role: step.performer.role || undefined,
            }
          : undefined,
        system: step.system || undefined,
        metrics: {
          avgDuration: step.avgDuration || undefined,
          frequency: step.frequency || undefined,
          executionCount: step.executionCount || undefined,
        },
        transitions: step.nextSteps
          ? (step.nextSteps as Array<{ targetStepId: string; condition?: string }>)
          : undefined,
      })),
      variants: process.variants?.map((variant) => ({
        id: variant.id,
        name: variant.name || undefined,
        frequency: variant.frequency,
        caseCount: variant.caseCount,
        steps: variant.stepSequence as string[],
        avgDuration: variant.avgDuration || undefined,
        isHappyPath: variant.isHappyPath || false,
      })),
      metrics: process.metrics
        ? {
            avgCycleTime: (process.metrics as Record<string, number>).avgCycleTime,
            minCycleTime: (process.metrics as Record<string, number>).minCycleTime,
            maxCycleTime: (process.metrics as Record<string, number>).maxCycleTime,
            avgSteps: (process.metrics as Record<string, number>).avgSteps,
            totalCases: (process.metrics as Record<string, number>).totalCases,
            completionRate: (process.metrics as Record<string, number>).completionRate,
          }
        : undefined,
      createdAt: process.createdAt.toISOString(),
      updatedAt: process.updatedAt.toISOString(),
    };

    // Fetch participants
    const participants = await this.prisma.person.findMany({
      where: {
        organizationId,
        processSteps: {
          some: {
            processId,
          },
        },
      },
    });

    processData.participants = participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role || undefined,
      department: p.department || undefined,
      email: p.email || undefined,
    }));

    return processData;
  }

  /**
   * Save generated SOP to database
   */
  private async saveSOP(
    organizationId: string,
    userId: string,
    processId: string,
    result: SOPGenerationResult,
    options: Partial<SOPGenerationOptions>
  ): Promise<{ id: string }> {
    const sop = await this.prisma.sOP.create({
      data: {
        organizationId,
        processId,
        title: result.title,
        content: result.content,
        version: result.version,
        language: result.language,
        status: 'draft',
        confidence: result.confidence.overall,
        generatedBy: userId,
        generationOptions: options as Record<string, unknown>,
        metadata: {
          tokenUsage: result.tokenUsage,
          generationTimeMs: result.metadata.generationTimeMs,
          model: result.metadata.model,
          warnings: result.warnings,
          confidenceBreakdown: result.confidence.breakdown,
          recommendations: result.confidence.recommendations,
        },
      },
    });

    // Create initial version record
    await this.prisma.sOPVersion.create({
      data: {
        sopId: sop.id,
        version: result.version,
        content: result.content,
        createdBy: userId,
        changeNotes: 'Initial generation',
      },
    });

    return { id: sop.id };
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Factory function
export function createSOPGenerationProcessor(): SOPGenerationProcessor {
  return new SOPGenerationProcessor();
}

export default SOPGenerationProcessor;
