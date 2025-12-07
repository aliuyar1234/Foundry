/**
 * Process Node Model
 * Handles Process and ProcessStep node operations in Neo4j
 */

import { runQuery, runWriteTransaction } from '../connection.js';

export interface ProcessNode {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  status: 'discovered' | 'validated' | 'documented';
  confidence: number;
  frequency: number;
  avgDuration?: number;
  owner?: string;
  department?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessStepNode {
  id: string;
  processId: string;
  name: string;
  activity: string;
  order: number;
  organizationId: string;
  frequency: number;
  avgDuration?: number;
  participants: string[];
  isStartStep: boolean;
  isEndStep: boolean;
  createdAt: Date;
}

export interface CreateProcessInput {
  name: string;
  description?: string;
  organizationId: string;
  confidence?: number;
  frequency?: number;
  avgDuration?: number;
  owner?: string;
  department?: string;
}

export interface CreateProcessStepInput {
  processId: string;
  name: string;
  activity: string;
  order: number;
  organizationId: string;
  frequency?: number;
  avgDuration?: number;
  participants?: string[];
  isStartStep?: boolean;
  isEndStep?: boolean;
}

/**
 * Create a new Process node
 */
export async function createProcess(input: CreateProcessInput): Promise<ProcessNode> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      CREATE (p:Process {
        id: randomUUID(),
        name: $name,
        description: $description,
        organizationId: $organizationId,
        status: 'discovered',
        confidence: $confidence,
        frequency: $frequency,
        avgDuration: $avgDuration,
        owner: $owner,
        department: $department,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      RETURN p
    `;

    const result = await tx.run(query, {
      name: input.name,
      description: input.description || null,
      organizationId: input.organizationId,
      confidence: input.confidence || 0,
      frequency: input.frequency || 0,
      avgDuration: input.avgDuration || null,
      owner: input.owner || null,
      department: input.department || null,
    });

    return result.records[0]?.get('p').properties;
  });

  return mapToProcessNode(result);
}

/**
 * Update a Process node
 */
export async function updateProcess(
  processId: string,
  updates: Partial<CreateProcessInput>
): Promise<ProcessNode | null> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (p:Process {id: $processId})
      SET p.name = COALESCE($name, p.name),
          p.description = COALESCE($description, p.description),
          p.confidence = COALESCE($confidence, p.confidence),
          p.frequency = COALESCE($frequency, p.frequency),
          p.avgDuration = COALESCE($avgDuration, p.avgDuration),
          p.owner = COALESCE($owner, p.owner),
          p.department = COALESCE($department, p.department),
          p.updatedAt = datetime()
      RETURN p
    `;

    const result = await tx.run(query, {
      processId,
      name: updates.name || null,
      description: updates.description || null,
      confidence: updates.confidence || null,
      frequency: updates.frequency || null,
      avgDuration: updates.avgDuration || null,
      owner: updates.owner || null,
      department: updates.department || null,
    });

    return result.records[0]?.get('p')?.properties;
  });

  return result ? mapToProcessNode(result) : null;
}

/**
 * Find Process by ID
 */
export async function findProcessById(processId: string): Promise<ProcessNode | null> {
  const results = await runQuery<{ p: { properties: Record<string, unknown> } }>(
    `
    MATCH (p:Process {id: $processId})
    RETURN p
    `,
    { processId }
  );

  if (results.length === 0) return null;
  return mapToProcessNode(results[0].p.properties);
}

/**
 * Find Processes by organization
 */
export async function findProcessesByOrganization(
  organizationId: string,
  options?: { status?: string; limit?: number; offset?: number }
): Promise<ProcessNode[]> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = `
    MATCH (p:Process {organizationId: $organizationId})
  `;

  if (options?.status) {
    query += ` WHERE p.status = $status`;
  }

  query += `
    RETURN p
    ORDER BY p.frequency DESC, p.name
    SKIP $offset LIMIT $limit
  `;

  const results = await runQuery<{ p: { properties: Record<string, unknown> } }>(
    query,
    { organizationId, status: options?.status || null, offset, limit }
  );

  return results.map(r => mapToProcessNode(r.p.properties));
}

/**
 * Create a ProcessStep node
 */
export async function createProcessStep(input: CreateProcessStepInput): Promise<ProcessStepNode> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (process:Process {id: $processId})
      CREATE (step:ProcessStep {
        id: randomUUID(),
        processId: $processId,
        name: $name,
        activity: $activity,
        order: $order,
        organizationId: $organizationId,
        frequency: $frequency,
        avgDuration: $avgDuration,
        participants: $participants,
        isStartStep: $isStartStep,
        isEndStep: $isEndStep,
        createdAt: datetime()
      })
      CREATE (process)-[:HAS_STEP]->(step)
      RETURN step
    `;

    const result = await tx.run(query, {
      processId: input.processId,
      name: input.name,
      activity: input.activity,
      order: input.order,
      organizationId: input.organizationId,
      frequency: input.frequency || 0,
      avgDuration: input.avgDuration || null,
      participants: input.participants || [],
      isStartStep: input.isStartStep || false,
      isEndStep: input.isEndStep || false,
    });

    return result.records[0]?.get('step').properties;
  });

  return mapToProcessStepNode(result);
}

/**
 * Bulk create ProcessStep nodes
 */
export async function bulkCreateProcessSteps(
  inputs: CreateProcessStepInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $steps as stepData
      MATCH (process:Process {id: stepData.processId})
      CREATE (step:ProcessStep {
        id: randomUUID(),
        processId: stepData.processId,
        name: stepData.name,
        activity: stepData.activity,
        order: stepData.order,
        organizationId: stepData.organizationId,
        frequency: stepData.frequency,
        avgDuration: stepData.avgDuration,
        participants: stepData.participants,
        isStartStep: stepData.isStartStep,
        isEndStep: stepData.isEndStep,
        createdAt: datetime()
      })
      CREATE (process)-[:HAS_STEP]->(step)
      RETURN count(step) as count
    `;

    const steps = inputs.map(input => ({
      processId: input.processId,
      name: input.name,
      activity: input.activity,
      order: input.order,
      organizationId: input.organizationId,
      frequency: input.frequency || 0,
      avgDuration: input.avgDuration || null,
      participants: input.participants || [],
      isStartStep: input.isStartStep || false,
      isEndStep: input.isEndStep || false,
    }));

    const result = await tx.run(query, { steps });
    return result.records[0]?.get('count').toNumber() || 0;
  });

  return result;
}

/**
 * Get ProcessSteps for a Process
 */
export async function getProcessSteps(processId: string): Promise<ProcessStepNode[]> {
  const results = await runQuery<{ step: { properties: Record<string, unknown> } }>(
    `
    MATCH (process:Process {id: $processId})-[:HAS_STEP]->(step:ProcessStep)
    RETURN step
    ORDER BY step.order
    `,
    { processId }
  );

  return results.map(r => mapToProcessStepNode(r.step.properties));
}

/**
 * Create FOLLOWS relationship between ProcessSteps
 */
export async function createFollowsRelationship(
  fromStepId: string,
  toStepId: string,
  frequency?: number
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (from:ProcessStep {id: $fromStepId})
      MATCH (to:ProcessStep {id: $toStepId})
      MERGE (from)-[r:FOLLOWS]->(to)
      SET r.frequency = COALESCE($frequency, r.frequency, 0)
    `;

    await tx.run(query, { fromStepId, toStepId, frequency: frequency || null });
  });
}

/**
 * Bulk create FOLLOWS relationships
 */
export async function bulkCreateFollowsRelationships(
  relationships: Array<{ fromStepId: string; toStepId: string; frequency?: number }>
): Promise<number> {
  if (relationships.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $rels as rel
      MATCH (from:ProcessStep {id: rel.fromStepId})
      MATCH (to:ProcessStep {id: rel.toStepId})
      MERGE (from)-[r:FOLLOWS]->(to)
      SET r.frequency = COALESCE(rel.frequency, r.frequency, 0)
      RETURN count(r) as count
    `;

    const result = await tx.run(query, {
      rels: relationships.map(r => ({
        fromStepId: r.fromStepId,
        toStepId: r.toStepId,
        frequency: r.frequency || 0,
      })),
    });
    return result.records[0]?.get('count').toNumber() || 0;
  });

  return result;
}

/**
 * Get process flow (steps with transitions)
 */
export async function getProcessFlow(processId: string): Promise<{
  steps: ProcessStepNode[];
  transitions: Array<{ from: string; to: string; frequency: number }>;
}> {
  const stepsResult = await runQuery<{
    step: { properties: Record<string, unknown> };
  }>(
    `
    MATCH (process:Process {id: $processId})-[:HAS_STEP]->(step:ProcessStep)
    RETURN step
    ORDER BY step.order
    `,
    { processId }
  );

  const transitionsResult = await runQuery<{
    fromId: string;
    toId: string;
    frequency: { low: number } | number;
  }>(
    `
    MATCH (process:Process {id: $processId})-[:HAS_STEP]->(from:ProcessStep)
          -[r:FOLLOWS]->(to:ProcessStep)
    RETURN from.id as fromId, to.id as toId, r.frequency as frequency
    `,
    { processId }
  );

  return {
    steps: stepsResult.map(r => mapToProcessStepNode(r.step.properties)),
    transitions: transitionsResult.map(r => ({
      from: r.fromId,
      to: r.toId,
      frequency: typeof r.frequency === 'number' ? r.frequency : r.frequency?.low || 0,
    })),
  };
}

/**
 * Delete a Process and all its steps
 */
export async function deleteProcess(processId: string): Promise<boolean> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (p:Process {id: $processId})
      OPTIONAL MATCH (p)-[:HAS_STEP]->(step:ProcessStep)
      DETACH DELETE p, step
      RETURN count(p) as deleted
    `;

    const result = await tx.run(query, { processId });
    return result.records[0]?.get('deleted').toNumber() || 0;
  });

  return result > 0;
}

/**
 * Map Neo4j record to ProcessNode
 */
function mapToProcessNode(properties: Record<string, unknown>): ProcessNode {
  return {
    id: properties.id as string,
    name: properties.name as string,
    description: properties.description as string | undefined,
    organizationId: properties.organizationId as string,
    status: properties.status as 'discovered' | 'validated' | 'documented',
    confidence: (properties.confidence as number) || 0,
    frequency: (properties.frequency as number) || 0,
    avgDuration: properties.avgDuration as number | undefined,
    owner: properties.owner as string | undefined,
    department: properties.department as string | undefined,
    createdAt: new Date(properties.createdAt as string),
    updatedAt: new Date(properties.updatedAt as string),
  };
}

/**
 * Map Neo4j record to ProcessStepNode
 */
function mapToProcessStepNode(properties: Record<string, unknown>): ProcessStepNode {
  return {
    id: properties.id as string,
    processId: properties.processId as string,
    name: properties.name as string,
    activity: properties.activity as string,
    order: (properties.order as number) || 0,
    organizationId: properties.organizationId as string,
    frequency: (properties.frequency as number) || 0,
    avgDuration: properties.avgDuration as number | undefined,
    participants: (properties.participants as string[]) || [],
    isStartStep: (properties.isStartStep as boolean) || false,
    isEndStep: (properties.isEndStep as boolean) || false,
    createdAt: new Date(properties.createdAt as string),
  };
}
