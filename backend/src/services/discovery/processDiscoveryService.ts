/**
 * Process Discovery Service
 * Orchestrates process discovery from event data
 */

import { Pool } from 'pg';
import {
  AlphaMiner,
  EventLogEntry,
  ProcessModel,
  discoverProcess,
} from './algorithms/alphaMiner.js';
import {
  calculateProcessMetrics,
  calculateActivityMetrics,
  calculateConformance,
  ProcessMetrics,
  ActivityMetrics,
} from './metrics/processMetrics.js';
import {
  createProcess,
  createProcessStep,
  bulkCreateProcessSteps,
  bulkCreateFollowsRelationships,
  findProcessesByOrganization,
  getProcessFlow,
  ProcessNode,
  ProcessStepNode,
  CreateProcessStepInput,
} from '../../graph/models/process.js';

export interface DiscoveryOptions {
  minCaseCount?: number;
  minActivityFrequency?: number;
  includeMetrics?: boolean;
  saveToDashboard?: boolean;
}

export interface DiscoveryResult {
  process: ProcessNode;
  steps: ProcessStepNode[];
  metrics?: ProcessMetrics;
  model: ProcessModel;
}

export interface EventQueryFilters {
  organizationId: string;
  sourceId?: string;
  eventTypes?: string[];
  from?: Date;
  to?: Date;
}

export class ProcessDiscoveryService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Discover processes from event data
   */
  async discoverProcesses(
    filters: EventQueryFilters,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveryResult[]> {
    const {
      minCaseCount = 5,
      minActivityFrequency = 3,
      includeMetrics = true,
      saveToDashboard = true,
    } = options;

    // Fetch events from TimescaleDB
    const eventLog = await this.fetchEventLog(filters);

    if (eventLog.length === 0) {
      return [];
    }

    // Group events by case (conversation/thread)
    const caseGroups = this.groupEventsByCaseId(eventLog);

    // Filter out cases with too few events
    const validCases = Array.from(caseGroups.entries()).filter(
      ([_, events]) => events.length >= 2
    );

    if (validCases.length < minCaseCount) {
      return [];
    }

    // Build event log for mining
    const miningLog: EventLogEntry[] = [];
    for (const [caseId, events] of validCases) {
      for (const event of events) {
        miningLog.push({
          caseId,
          activity: event.activity,
          timestamp: event.timestamp,
          actorId: event.actorId,
          metadata: event.metadata,
        });
      }
    }

    // Run Alpha Miner
    const processModel = discoverProcess(miningLog);

    // Filter activities by frequency
    const activityFrequency = new Map<string, number>();
    for (const entry of miningLog) {
      activityFrequency.set(entry.activity, (activityFrequency.get(entry.activity) || 0) + 1);
    }

    const validActivities = Array.from(activityFrequency.entries())
      .filter(([_, count]) => count >= minActivityFrequency)
      .map(([activity]) => activity);

    if (validActivities.length < 2) {
      return [];
    }

    // Calculate metrics if requested
    let metrics: ProcessMetrics | undefined;
    if (includeMetrics) {
      metrics = calculateProcessMetrics(miningLog);
    }

    // Save to graph if requested
    let process: ProcessNode | undefined;
    let steps: ProcessStepNode[] = [];

    if (saveToDashboard) {
      const savedResult = await this.saveDiscoveredProcess(
        filters.organizationId,
        processModel,
        miningLog,
        metrics
      );
      process = savedResult.process;
      steps = savedResult.steps;
    }

    return [
      {
        process: process || this.createTemporaryProcessNode(filters.organizationId, processModel),
        steps,
        metrics,
        model: processModel,
      },
    ];
  }

  /**
   * Fetch event log from TimescaleDB
   */
  private async fetchEventLog(filters: EventQueryFilters): Promise<Array<{
    caseId: string;
    activity: string;
    timestamp: Date;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }>> {
    const conditions = ['organization_id = $1'];
    const values: unknown[] = [filters.organizationId];
    let paramIndex = 2;

    if (filters.sourceId) {
      conditions.push(`source_id = $${paramIndex++}`);
      values.push(filters.sourceId);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      conditions.push(`event_type = ANY($${paramIndex++})`);
      values.push(filters.eventTypes);
    }

    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(filters.from);
    }

    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(filters.to);
    }

    const query = `
      SELECT
        COALESCE(metadata->>'conversationId', metadata->>'threadId', id::text) as case_id,
        event_type as activity,
        timestamp,
        actor_id,
        metadata
      FROM events
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp ASC
      LIMIT 100000
    `;

    const result = await this.pool.query(query, values);

    return result.rows.map(row => ({
      caseId: row.case_id,
      activity: row.activity,
      timestamp: new Date(row.timestamp),
      actorId: row.actor_id,
      metadata: row.metadata,
    }));
  }

  /**
   * Group events by case ID
   */
  private groupEventsByCaseId(events: Array<{
    caseId: string;
    activity: string;
    timestamp: Date;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }>): Map<string, typeof events> {
    const groups = new Map<string, typeof events>();

    for (const event of events) {
      const existing = groups.get(event.caseId) || [];
      existing.push(event);
      groups.set(event.caseId, existing);
    }

    // Sort events within each case by timestamp
    for (const events of groups.values()) {
      events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    return groups;
  }

  /**
   * Save discovered process to Neo4j
   */
  private async saveDiscoveredProcess(
    organizationId: string,
    model: ProcessModel,
    eventLog: EventLogEntry[],
    metrics?: ProcessMetrics
  ): Promise<{ process: ProcessNode; steps: ProcessStepNode[] }> {
    // Create process node
    const process = await createProcess({
      name: model.name,
      organizationId,
      confidence: this.calculateModelConfidence(model, eventLog),
      frequency: metrics?.totalCases || 0,
      avgDuration: metrics?.avgCaseDuration,
    });

    // Create step nodes
    const stepInputs: CreateProcessStepInput[] = [];
    const activityToStepId = new Map<string, string>();
    let order = 0;

    for (const transition of model.transitions) {
      const stepId = `step_${process.id}_${order}`;
      activityToStepId.set(transition.activity, stepId);

      stepInputs.push({
        processId: process.id,
        name: transition.name,
        activity: transition.activity,
        order: order++,
        organizationId,
        frequency: transition.frequency,
        avgDuration: metrics?.avgActivityDuration.get(transition.activity),
        isStartStep: model.startActivities.has(transition.activity),
        isEndStep: model.endActivities.has(transition.activity),
      });
    }

    await bulkCreateProcessSteps(stepInputs);

    // Create FOLLOWS relationships based on causality
    const relationships: Array<{ fromStepId: string; toStepId: string; frequency?: number }> = [];

    for (const [from, successors] of model.causality) {
      for (const to of successors) {
        const fromStepId = activityToStepId.get(from);
        const toStepId = activityToStepId.get(to);

        if (fromStepId && toStepId) {
          // Calculate transition frequency from event log
          const transitionKey = `${from} -> ${to}`;
          const frequency = metrics?.transitionFrequency.get(transitionKey) || 0;

          relationships.push({
            fromStepId,
            toStepId,
            frequency,
          });
        }
      }
    }

    await bulkCreateFollowsRelationships(relationships);

    // Get created steps
    const flowResult = await getProcessFlow(process.id);

    return {
      process,
      steps: flowResult.steps,
    };
  }

  /**
   * Calculate model confidence based on data quality
   */
  private calculateModelConfidence(
    model: ProcessModel,
    eventLog: EventLogEntry[]
  ): number {
    // Factors affecting confidence:
    // 1. Number of cases
    // 2. Consistency of traces
    // 3. Coverage of activities

    const miner = new AlphaMiner(eventLog);
    const stats = miner.getStatistics();

    // More cases = higher confidence
    const caseScore = Math.min(stats.totalCases / 100, 1) * 0.3;

    // Fewer variants relative to cases = more consistent
    const consistencyScore = stats.totalCases > 0
      ? (1 - stats.traceVariants / stats.totalCases) * 0.3
      : 0;

    // More activities discovered = better coverage
    const coverageScore = Math.min(stats.uniqueActivities / 10, 1) * 0.2;

    // Higher average trace length = more complete processes
    const completenessScore = Math.min(stats.avgTraceLength / 5, 1) * 0.2;

    return caseScore + consistencyScore + coverageScore + completenessScore;
  }

  /**
   * Create a temporary process node (not saved to DB)
   */
  private createTemporaryProcessNode(
    organizationId: string,
    model: ProcessModel
  ): ProcessNode {
    return {
      id: model.id,
      name: model.name,
      organizationId,
      status: 'discovered',
      confidence: 0,
      frequency: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get discovered processes for an organization
   */
  async getDiscoveredProcesses(
    organizationId: string,
    options?: { limit?: number; status?: string }
  ): Promise<ProcessNode[]> {
    return findProcessesByOrganization(organizationId, options);
  }

  /**
   * Get process details with flow
   */
  async getProcessDetails(processId: string): Promise<{
    process: ProcessNode | null;
    steps: ProcessStepNode[];
    transitions: Array<{ from: string; to: string; frequency: number }>;
  } | null> {
    const flowResult = await getProcessFlow(processId);

    if (flowResult.steps.length === 0) {
      return null;
    }

    return {
      process: null, // Would need to fetch from findProcessById
      steps: flowResult.steps,
      transitions: flowResult.transitions,
    };
  }

  /**
   * Calculate conformance for a process
   */
  async calculateProcessConformance(
    processId: string,
    filters: EventQueryFilters
  ): Promise<{ conformanceRate: number; deviations: unknown[] }> {
    // Get expected sequence from process
    const flowResult = await getProcessFlow(processId);
    const expectedSequence = flowResult.steps
      .sort((a, b) => a.order - b.order)
      .map(s => s.activity);

    // Fetch event log
    const eventLog = await this.fetchEventLog(filters);

    const miningLog: EventLogEntry[] = eventLog.map(e => ({
      caseId: e.caseId,
      activity: e.activity,
      timestamp: e.timestamp,
      actorId: e.actorId,
      metadata: e.metadata,
    }));

    return calculateConformance(miningLog, expectedSequence);
  }
}

// Factory function
let processDiscoveryServiceInstance: ProcessDiscoveryService | null = null;

export function createProcessDiscoveryService(pool: Pool): ProcessDiscoveryService {
  if (!processDiscoveryServiceInstance) {
    processDiscoveryServiceInstance = new ProcessDiscoveryService(pool);
  }
  return processDiscoveryServiceInstance;
}
