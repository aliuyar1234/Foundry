/**
 * BPMN 2.0 XML Exporter
 * Generates BPMN 2.0 compliant XML from discovered processes
 * T275 - BPMN export implementation
 */

import { Pool } from 'pg';

export interface BpmnExportOptions {
  organizationId: string;
  processIds?: string[];
  includeParticipants?: boolean;
  includeDiagram?: boolean;
  includeDocumentation?: boolean;
  layoutAlgorithm?: 'horizontal' | 'vertical' | 'hierarchical';
}

export interface BpmnExportResult {
  success: boolean;
  processId: string;
  processName: string;
  xml: string;
  filename: string;
  elementCount: number;
  warnings: string[];
}

interface ProcessData {
  id: string;
  name: string;
  description?: string;
  steps: ProcessStep[];
  participants: Participant[];
}

interface ProcessStep {
  id: string;
  name: string;
  description?: string;
  type: 'task' | 'start' | 'end' | 'gateway' | 'subprocess' | 'event';
  subtype?: string;
  assignee?: string;
  department?: string;
  nextSteps?: string[];
  prevSteps?: string[];
  duration?: number;
  isAutomated?: boolean;
}

interface Participant {
  id: string;
  name: string;
  type: 'lane' | 'pool';
  department?: string;
}

/**
 * Export processes to BPMN 2.0 XML
 */
export async function exportToBpmn(
  pool: Pool,
  options: BpmnExportOptions
): Promise<BpmnExportResult[]> {
  const results: BpmnExportResult[] = [];

  // Get processes from database
  const processes = await getProcesses(pool, options);

  for (const process of processes) {
    const result = generateBpmnXml(process, options);
    results.push(result);
  }

  return results;
}

/**
 * Get processes from database
 */
async function getProcesses(
  pool: Pool,
  options: BpmnExportOptions
): Promise<ProcessData[]> {
  let query = `
    SELECT
      p.id,
      p.name,
      p.description,
      COALESCE(
        (SELECT json_agg(json_build_object(
          'id', ps.id,
          'name', ps.name,
          'description', ps.description,
          'type', ps.step_type,
          'subtype', ps.subtype,
          'assignee', ps.assignee,
          'department', ps.department,
          'nextSteps', ps.next_step_ids,
          'prevSteps', ps.prev_step_ids,
          'duration', ps.avg_duration_minutes,
          'isAutomated', ps.is_automated
        ) ORDER BY ps.sequence_order)
        FROM process_steps ps WHERE ps.process_id = p.id),
        '[]'
      ) as steps,
      COALESCE(
        (SELECT json_agg(DISTINCT jsonb_build_object(
          'id', per.id,
          'name', per.display_name,
          'type', 'lane',
          'department', per.department
        ))
        FROM process_steps ps2
        JOIN persons per ON ps2.assignee = per.id
        WHERE ps2.process_id = p.id),
        '[]'
      ) as participants
    FROM processes p
    WHERE p.organization_id = $1
  `;

  const params: any[] = [options.organizationId];

  if (options.processIds && options.processIds.length > 0) {
    query += ` AND p.id = ANY($2)`;
    params.push(options.processIds);
  }

  const result = await pool.query(query, params).catch(() => ({ rows: [] }));

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    steps: row.steps || [],
    participants: row.participants || [],
  }));
}

/**
 * Generate BPMN 2.0 XML for a process
 */
function generateBpmnXml(
  process: ProcessData,
  options: BpmnExportOptions
): BpmnExportResult {
  const warnings: string[] = [];
  const processId = sanitizeId(process.id);
  const processName = escapeXml(process.name);

  // Normalize steps
  const steps = normalizeSteps(process.steps, warnings);

  // Build XML
  const xml = buildBpmnDocument(process, steps, options, warnings);

  return {
    success: true,
    processId: process.id,
    processName: process.name,
    xml,
    filename: `${sanitizeFilename(process.name)}.bpmn`,
    elementCount: steps.length,
    warnings,
  };
}

/**
 * Normalize and validate process steps
 */
function normalizeSteps(steps: ProcessStep[], warnings: string[]): ProcessStep[] {
  if (steps.length === 0) {
    // Create minimal process with start and end
    warnings.push('No steps found, creating minimal process');
    return [
      { id: 'start', name: 'Start', type: 'start', nextSteps: ['end'] },
      { id: 'end', name: 'End', type: 'end', prevSteps: ['start'] },
    ];
  }

  // Find or create start event
  let hasStart = steps.some((s) => s.type === 'start');
  let hasEnd = steps.some((s) => s.type === 'end');

  const normalizedSteps = [...steps];

  if (!hasStart) {
    // Find first step (no prev steps)
    const firstSteps = steps.filter(
      (s) => !s.prevSteps || s.prevSteps.length === 0
    );

    if (firstSteps.length > 0) {
      normalizedSteps.unshift({
        id: 'StartEvent_1',
        name: 'Start',
        type: 'start',
        nextSteps: firstSteps.map((s) => s.id),
      });
      firstSteps.forEach((s) => {
        s.prevSteps = ['StartEvent_1'];
      });
    }
  }

  if (!hasEnd) {
    // Find last steps (no next steps)
    const lastSteps = normalizedSteps.filter(
      (s) => !s.nextSteps || s.nextSteps.length === 0
    );

    if (lastSteps.length > 0) {
      normalizedSteps.push({
        id: 'EndEvent_1',
        name: 'End',
        type: 'end',
        prevSteps: lastSteps.map((s) => s.id),
      });
      lastSteps.forEach((s) => {
        s.nextSteps = ['EndEvent_1'];
      });
    }
  }

  return normalizedSteps;
}

/**
 * Build complete BPMN document
 */
function buildBpmnDocument(
  process: ProcessData,
  steps: ProcessStep[],
  options: BpmnExportOptions,
  warnings: string[]
): string {
  const processId = sanitizeId(process.id);
  const processName = escapeXml(process.name);

  // Build elements
  const elements: string[] = [];
  const flows: string[] = [];
  let flowCounter = 1;

  // Group steps by department for lanes
  const departments = new Map<string, ProcessStep[]>();
  for (const step of steps) {
    const dept = step.department || 'Default';
    if (!departments.has(dept)) {
      departments.set(dept, []);
    }
    departments.get(dept)!.push(step);
  }

  // Generate step elements
  for (const step of steps) {
    const element = generateStepElement(step, options);
    elements.push(element);

    // Generate sequence flows
    if (step.nextSteps) {
      for (const nextId of step.nextSteps) {
        const flowId = `Flow_${flowCounter++}`;
        flows.push(generateSequenceFlow(flowId, step.id, nextId));
      }
    }
  }

  // Build lanes if participants enabled
  let lanesXml = '';
  if (options.includeParticipants && departments.size > 1) {
    const lanes: string[] = [];
    let laneIdx = 1;
    for (const [deptName, deptSteps] of departments) {
      const laneId = `Lane_${laneIdx++}`;
      const flowNodeRefs = deptSteps.map((s) => `        <bpmn:flowNodeRef>${sanitizeId(s.id)}</bpmn:flowNodeRef>`).join('\n');
      lanes.push(`      <bpmn:lane id="${laneId}" name="${escapeXml(deptName)}">
${flowNodeRefs}
      </bpmn:lane>`);
    }
    lanesXml = `    <bpmn:laneSet id="LaneSet_1">
${lanes.join('\n')}
    </bpmn:laneSet>`;
  }

  // Build process element
  const processXml = `  <bpmn:process id="Process_${processId}" name="${processName}" isExecutable="true">
${options.includeDocumentation && process.description ? `    <bpmn:documentation>${escapeXml(process.description)}</bpmn:documentation>` : ''}
${lanesXml}
${elements.join('\n')}
${flows.join('\n')}
  </bpmn:process>`;

  // Build diagram if requested
  let diagramXml = '';
  if (options.includeDiagram) {
    diagramXml = generateDiagram(process, steps, options);
  }

  // Combine into final document
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  id="Definitions_${processId}"
                  targetNamespace="http://bpmn.io/schema/bpmn"
                  exporter="Foundry BPMN Exporter"
                  exporterVersion="1.0">
${processXml}
${diagramXml}
</bpmn:definitions>`;
}

/**
 * Generate BPMN element for a step
 */
function generateStepElement(step: ProcessStep, options: BpmnExportOptions): string {
  const stepId = sanitizeId(step.id);
  const stepName = escapeXml(step.name);

  const incomingFlows = step.prevSteps?.map((id) => `      <bpmn:incoming>Flow_${id}</bpmn:incoming>`).join('\n') || '';
  const outgoingFlows = step.nextSteps?.map((id) => `      <bpmn:outgoing>Flow_${id}</bpmn:outgoing>`).join('\n') || '';

  const documentation = options.includeDocumentation && step.description
    ? `      <bpmn:documentation>${escapeXml(step.description)}</bpmn:documentation>\n`
    : '';

  switch (step.type) {
    case 'start':
      return `    <bpmn:startEvent id="${stepId}" name="${stepName}">
${outgoingFlows}
    </bpmn:startEvent>`;

    case 'end':
      return `    <bpmn:endEvent id="${stepId}" name="${stepName}">
${incomingFlows}
    </bpmn:endEvent>`;

    case 'gateway':
      const gatewayType = step.subtype === 'parallel' ? 'parallelGateway' : 'exclusiveGateway';
      return `    <bpmn:${gatewayType} id="${stepId}" name="${stepName}">
${incomingFlows}
${outgoingFlows}
    </bpmn:${gatewayType}>`;

    case 'subprocess':
      return `    <bpmn:subProcess id="${stepId}" name="${stepName}">
${documentation}${incomingFlows}
${outgoingFlows}
    </bpmn:subProcess>`;

    case 'event':
      const eventType = step.subtype === 'timer' ? 'intermediateCatchEvent' : 'intermediateThrowEvent';
      return `    <bpmn:${eventType} id="${stepId}" name="${stepName}">
${incomingFlows}
${outgoingFlows}
    </bpmn:${eventType}>`;

    case 'task':
    default:
      const taskType = step.isAutomated ? 'serviceTask' : 'userTask';
      return `    <bpmn:${taskType} id="${stepId}" name="${stepName}">
${documentation}${incomingFlows}
${outgoingFlows}
    </bpmn:${taskType}>`;
  }
}

/**
 * Generate sequence flow element
 */
function generateSequenceFlow(flowId: string, sourceId: string, targetId: string): string {
  return `    <bpmn:sequenceFlow id="${flowId}" sourceRef="${sanitizeId(sourceId)}" targetRef="${sanitizeId(targetId)}" />`;
}

/**
 * Generate BPMN diagram elements
 */
function generateDiagram(
  process: ProcessData,
  steps: ProcessStep[],
  options: BpmnExportOptions
): string {
  const processId = sanitizeId(process.id);
  const layout = calculateLayout(steps, options.layoutAlgorithm || 'horizontal');

  const shapes: string[] = [];
  const edges: string[] = [];

  // Generate shapes for each step
  for (const step of steps) {
    const stepId = sanitizeId(step.id);
    const pos = layout.get(stepId) || { x: 100, y: 100, width: 100, height: 80 };

    shapes.push(`      <bpmndi:BPMNShape id="${stepId}_di" bpmnElement="${stepId}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>`);

    // Generate edges for flows
    if (step.nextSteps) {
      for (let i = 0; i < step.nextSteps.length; i++) {
        const targetId = sanitizeId(step.nextSteps[i]);
        const targetPos = layout.get(targetId) || { x: 200, y: 100, width: 100, height: 80 };

        edges.push(`      <bpmndi:BPMNEdge id="Flow_${stepId}_${i}_di" bpmnElement="Flow_${stepId}_${i}">
        <di:waypoint x="${pos.x + pos.width}" y="${pos.y + pos.height / 2}" />
        <di:waypoint x="${targetPos.x}" y="${targetPos.y + targetPos.height / 2}" />
      </bpmndi:BPMNEdge>`);
      }
    }
  }

  return `  <bpmndi:BPMNDiagram id="BPMNDiagram_${processId}">
    <bpmndi:BPMNPlane id="BPMNPlane_${processId}" bpmnElement="Process_${processId}">
${shapes.join('\n')}
${edges.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
}

/**
 * Calculate layout positions for diagram
 */
function calculateLayout(
  steps: ProcessStep[],
  algorithm: 'horizontal' | 'vertical' | 'hierarchical'
): Map<string, { x: number; y: number; width: number; height: number }> {
  const layout = new Map<string, { x: number; y: number; width: number; height: number }>();

  // Build graph structure
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const step of steps) {
    graph.set(step.id, step.nextSteps || []);
    if (!inDegree.has(step.id)) {
      inDegree.set(step.id, 0);
    }
    for (const next of step.nextSteps || []) {
      inDegree.set(next, (inDegree.get(next) || 0) + 1);
    }
  }

  // Topological sort for levels
  const levels: string[][] = [];
  const queue: string[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const currentLevel: string[] = [];
    const size = queue.length;

    for (let i = 0; i < size; i++) {
      const current = queue.shift()!;
      currentLevel.push(current);

      for (const next of graph.get(current) || []) {
        const deg = inDegree.get(next)! - 1;
        inDegree.set(next, deg);
        if (deg === 0) {
          queue.push(next);
        }
      }
    }

    if (currentLevel.length > 0) {
      levels.push(currentLevel);
    }
  }

  // Position elements based on layout algorithm
  const gapX = algorithm === 'vertical' ? 0 : 180;
  const gapY = algorithm === 'vertical' ? 120 : 0;
  const startX = 100;
  const startY = 100;

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx];
    const levelOffset = (level.length - 1) * (algorithm === 'vertical' ? gapX + 100 : gapY + 80) / 2;

    for (let i = 0; i < level.length; i++) {
      const stepId = level[i];
      const step = steps.find((s) => s.id === stepId);

      let width = 100;
      let height = 80;

      // Adjust size based on element type
      if (step?.type === 'start' || step?.type === 'end') {
        width = 36;
        height = 36;
      } else if (step?.type === 'gateway') {
        width = 50;
        height = 50;
      }

      if (algorithm === 'vertical') {
        layout.set(stepId, {
          x: startX + i * (100 + 50) - levelOffset,
          y: startY + levelIdx * (80 + gapY),
          width,
          height,
        });
      } else {
        layout.set(stepId, {
          x: startX + levelIdx * (100 + gapX),
          y: startY + i * (80 + 50) - levelOffset,
          width,
          height,
        });
      }
    }
  }

  return layout;
}

/**
 * Sanitize ID for BPMN compatibility
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^([0-9])/, '_$1');
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Export single process to BPMN
 */
export async function exportProcessToBpmn(
  pool: Pool,
  organizationId: string,
  processId: string,
  options?: Partial<BpmnExportOptions>
): Promise<BpmnExportResult> {
  const results = await exportToBpmn(pool, {
    organizationId,
    processIds: [processId],
    includeDiagram: true,
    includeDocumentation: true,
    includeParticipants: true,
    ...options,
  });

  if (results.length === 0) {
    return {
      success: false,
      processId,
      processName: '',
      xml: '',
      filename: '',
      elementCount: 0,
      warnings: ['Process not found'],
    };
  }

  return results[0];
}

export default {
  exportToBpmn,
  exportProcessToBpmn,
};
