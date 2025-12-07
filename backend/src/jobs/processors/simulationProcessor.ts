/**
 * Simulation Job Processor (T171)
 * BullMQ processor for running simulations asynchronously
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PersonnelSimulator, type PersonnelChange } from '../../services/simulation/personnelSimulator';
import { ProcessSimulator, type ProcessChange } from '../../services/simulation/processSimulator';
import { OrgStructureSimulator, type OrgStructureChange } from '../../services/simulation/orgStructureSimulator';
import { ImpactQuantifier } from '../../services/simulation/impactQuantifier';
import { MitigationRecommender } from '../../services/simulation/mitigationRecommender';
import { auditService } from '../../services/audit/auditService';
import { logger } from '../../lib/logger';

const prisma = new PrismaClient();

export type SimulationType = 'personnel' | 'process' | 'organization' | 'combined';

export interface SimulationJobData {
  organizationId: string;
  simulationId: string;
  type: SimulationType;
  userId: string;
  name: string;
  description?: string;
  changes: {
    personnel?: PersonnelChange[];
    process?: ProcessChange[];
    organization?: OrgStructureChange[];
  };
  options?: {
    includeMitigation?: boolean;
    includeFinancials?: boolean;
    scenario?: 'optimistic' | 'realistic' | 'pessimistic';
  };
}

export interface SimulationResult {
  id: string;
  type: SimulationType;
  status: 'completed' | 'failed';
  executedAt: Date;
  duration: number;
  summary: {
    overallScore: number;
    impactLevel: string;
    netBenefit: boolean;
    keyTakeaway: string;
  };
  impacts: {
    personnel?: unknown[];
    process?: unknown[];
    organization?: unknown[];
    quantified?: unknown;
  };
  mitigation?: unknown;
  errors?: string[];
}

/**
 * Process simulation job
 */
export async function processSimulationJob(job: Job<SimulationJobData>): Promise<SimulationResult> {
  const startTime = Date.now();
  const { organizationId, simulationId, type, userId, name, changes, options } = job.data;

  const log = logger.child({ jobId: job.id, simulationId, type });
  log.info('Starting simulation job');

  try {
    // Update simulation status to processing
    await updateSimulationStatus(simulationId, 'processing', 0);

    // Initialize services
    const personnelSimulator = new PersonnelSimulator(organizationId);
    const processSimulator = new ProcessSimulator(organizationId);
    const orgSimulator = new OrgStructureSimulator(organizationId);
    const impactQuantifier = new ImpactQuantifier();
    const mitigationRecommender = new MitigationRecommender();

    const impacts: SimulationResult['impacts'] = {};
    const errors: string[] = [];
    let progress = 10;

    // Run personnel simulations
    if (changes.personnel && changes.personnel.length > 0) {
      log.info(`Running ${changes.personnel.length} personnel simulations`);
      await updateSimulationStatus(simulationId, 'processing', progress, 'Running personnel simulations');

      try {
        impacts.personnel = await personnelSimulator.simulateChanges(changes.personnel);
        progress += 25;
      } catch (err) {
        log.error({ err }, 'Personnel simulation failed');
        errors.push(`Personnel simulation error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await job.updateProgress(progress);

    // Run process simulations
    if (changes.process && changes.process.length > 0) {
      log.info(`Running ${changes.process.length} process simulations`);
      await updateSimulationStatus(simulationId, 'processing', progress, 'Running process simulations');

      try {
        impacts.process = [];
        for (const change of changes.process) {
          const impact = await processSimulator.simulateChange(change);
          impacts.process.push(impact);
        }
        progress += 25;
      } catch (err) {
        log.error({ err }, 'Process simulation failed');
        errors.push(`Process simulation error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await job.updateProgress(progress);

    // Run organization structure simulations
    if (changes.organization && changes.organization.length > 0) {
      log.info(`Running ${changes.organization.length} org structure simulations`);
      await updateSimulationStatus(simulationId, 'processing', progress, 'Running organization simulations');

      try {
        impacts.organization = [];
        for (const change of changes.organization) {
          const impact = await orgSimulator.simulateChange(change);
          impacts.organization.push(impact);
        }
        progress += 25;
      } catch (err) {
        log.error({ err }, 'Organization simulation failed');
        errors.push(`Organization simulation error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await job.updateProgress(progress);

    // Quantify impacts
    log.info('Quantifying impacts');
    await updateSimulationStatus(simulationId, 'processing', progress, 'Quantifying impacts');

    const quantifiedImpacts = [];

    if (impacts.personnel) {
      for (const personnelImpact of impacts.personnel as unknown[]) {
        quantifiedImpacts.push(
          impactQuantifier.quantifyPersonnelImpact(personnelImpact as Parameters<typeof impactQuantifier.quantifyPersonnelImpact>[0])
        );
      }
    }

    if (impacts.process) {
      for (const processImpact of impacts.process as unknown[]) {
        quantifiedImpacts.push(
          impactQuantifier.quantifyProcessImpact(processImpact as Parameters<typeof impactQuantifier.quantifyProcessImpact>[0])
        );
      }
    }

    if (impacts.organization) {
      for (const orgImpact of impacts.organization as unknown[]) {
        quantifiedImpacts.push(
          impactQuantifier.quantifyOrgStructureImpact(orgImpact as Parameters<typeof impactQuantifier.quantifyOrgStructureImpact>[0])
        );
      }
    }

    // Aggregate if multiple impacts
    let aggregatedImpact;
    if (quantifiedImpacts.length > 1) {
      aggregatedImpact = impactQuantifier.aggregateImpacts(quantifiedImpacts);
    } else if (quantifiedImpacts.length === 1) {
      aggregatedImpact = quantifiedImpacts[0];
    }

    impacts.quantified = aggregatedImpact;
    progress = 80;
    await job.updateProgress(progress);

    // Generate mitigation plan if requested
    let mitigation;
    if (options?.includeMitigation && aggregatedImpact) {
      log.info('Generating mitigation plan');
      await updateSimulationStatus(simulationId, 'processing', progress, 'Generating mitigation recommendations');

      try {
        mitigation = mitigationRecommender.generateMitigationPlan(aggregatedImpact);
      } catch (err) {
        log.error({ err }, 'Mitigation generation failed');
        errors.push(`Mitigation generation error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    progress = 95;
    await job.updateProgress(progress);

    // Prepare summary
    const summary = aggregatedImpact ? {
      overallScore: aggregatedImpact.summary.overallScore,
      impactLevel: aggregatedImpact.summary.impactLevel,
      netBenefit: aggregatedImpact.summary.netBenefit,
      keyTakeaway: aggregatedImpact.summary.keyTakeaway,
    } : {
      overallScore: 0,
      impactLevel: 'unknown',
      netBenefit: false,
      keyTakeaway: 'Simulation completed with errors',
    };

    const duration = Date.now() - startTime;

    // Save results
    const result: SimulationResult = {
      id: simulationId,
      type,
      status: errors.length === 0 ? 'completed' : 'completed',
      executedAt: new Date(),
      duration,
      summary,
      impacts,
      mitigation,
      errors: errors.length > 0 ? errors : undefined,
    };

    await saveSimulationResults(simulationId, result);
    await updateSimulationStatus(simulationId, 'completed', 100);

    // Audit log
    await auditService.log({
      organizationId,
      userId,
      action: 'simulation.completed',
      resourceType: 'simulation',
      resourceId: simulationId,
      details: {
        type,
        name,
        duration,
        overallScore: summary.overallScore,
        impactLevel: summary.impactLevel,
      },
    });

    log.info({ duration, summary }, 'Simulation completed');

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error({ error, duration }, 'Simulation job failed');

    await updateSimulationStatus(
      simulationId,
      'failed',
      0,
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Audit log
    await auditService.log({
      organizationId,
      userId,
      action: 'simulation.failed',
      resourceType: 'simulation',
      resourceId: simulationId,
      details: {
        type,
        name,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

/**
 * Update simulation status in database
 */
async function updateSimulationStatus(
  simulationId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress: number,
  message?: string
): Promise<void> {
  await prisma.simulation.update({
    where: { id: simulationId },
    data: {
      status,
      progress,
      statusMessage: message,
      ...(status === 'completed' || status === 'failed'
        ? { completedAt: new Date() }
        : {}),
    },
  });
}

/**
 * Save simulation results to database
 */
async function saveSimulationResults(
  simulationId: string,
  results: SimulationResult
): Promise<void> {
  await prisma.simulation.update({
    where: { id: simulationId },
    data: {
      results: results as unknown as Record<string, unknown>,
      overallScore: results.summary.overallScore,
      impactLevel: results.summary.impactLevel,
    },
  });
}

/**
 * Job options for simulation processing
 */
export const simulationJobOptions = {
  attempts: 2,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    age: 7 * 24 * 60 * 60, // 7 days
    count: 100,
  },
  removeOnFail: {
    age: 30 * 24 * 60 * 60, // 30 days
  },
};

export default processSimulationJob;
