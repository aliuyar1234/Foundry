/**
 * Process Input Formatter
 * Transforms process data from discovery into SOP-ready format
 */

import {
  ProcessInput,
  ProcessStepInput,
  ProcessVariantInput,
  ProcessMetrics,
} from './prompts/sopTemplates.js';

export interface ProcessData {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  steps?: ProcessStepData[];
  variants?: ProcessVariantData[];
  metrics?: ProcessMetricsData;
  participants?: ParticipantData[];
  systems?: SystemData[];
  documents?: DocumentData[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcessStepData {
  id: string;
  name: string;
  description?: string;
  type: string;
  performer?: string | { id: string; name: string; role?: string };
  system?: string | { id: string; name: string };
  metrics?: {
    avgDuration?: number;
    minDuration?: number;
    maxDuration?: number;
    frequency?: number;
    executionCount?: number;
  };
  transitions?: Array<{
    targetStepId: string;
    condition?: string;
    probability?: number;
  }>;
  inputs?: string[];
  outputs?: string[];
  risks?: string[];
  notes?: string[];
}

export interface ProcessVariantData {
  id: string;
  name?: string;
  frequency: number;
  caseCount: number;
  steps: string[];
  avgDuration?: number;
  isHappyPath?: boolean;
}

export interface ProcessMetricsData {
  avgCycleTime?: number;
  minCycleTime?: number;
  maxCycleTime?: number;
  medianCycleTime?: number;
  avgSteps?: number;
  totalCases?: number;
  completedCases?: number;
  completionRate?: number;
  bottlenecks?: Array<{
    stepId: string;
    stepName: string;
    waitTime: number;
    impact: number;
  }>;
  rework?: {
    rate: number;
    commonSteps: string[];
  };
}

export interface ParticipantData {
  id: string;
  name: string;
  role?: string;
  department?: string;
  email?: string;
  stepCount?: number;
}

export interface SystemData {
  id: string;
  name: string;
  type?: string;
  vendor?: string;
  stepCount?: number;
}

export interface DocumentData {
  id: string;
  name: string;
  type?: string;
  url?: string;
}

/**
 * Format process data for SOP generation prompt
 */
export function formatProcessForSOP(processData: ProcessData): ProcessInput {
  return {
    id: processData.id,
    name: processData.name,
    description: processData.description,
    steps: formatSteps(processData.steps || []),
    variants: formatVariants(processData.variants || []),
    metrics: formatMetrics(processData.metrics),
    participants: formatParticipants(processData.participants || []),
    systems: formatSystems(processData.systems || []),
    documents: formatDocuments(processData.documents || []),
  };
}

/**
 * Format process steps
 */
function formatSteps(steps: ProcessStepData[]): ProcessStepInput[] {
  return steps.map((step) => {
    const formatted: ProcessStepInput = {
      id: step.id,
      name: step.name,
      description: step.description,
      type: mapStepType(step.type),
    };

    // Format performer
    if (step.performer) {
      formatted.performer = typeof step.performer === 'string'
        ? step.performer
        : step.performer.name;
    }

    // Format system
    if (step.system) {
      formatted.system = typeof step.system === 'string'
        ? step.system
        : step.system.name;
    }

    // Format metrics
    if (step.metrics) {
      if (step.metrics.avgDuration) {
        formatted.avgDuration = step.metrics.avgDuration;
      }
      if (step.metrics.frequency) {
        formatted.frequency = step.metrics.frequency;
      }
    }

    // Format transitions
    if (step.transitions && step.transitions.length > 0) {
      formatted.nextSteps = step.transitions.map((t) => t.targetStepId);
      formatted.conditions = step.transitions
        .filter((t) => t.condition)
        .map((t) => t.condition!);
    }

    return formatted;
  });
}

/**
 * Map step type to standard types
 */
function mapStepType(type: string): 'start' | 'end' | 'task' | 'decision' | 'subprocess' {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes('start') || normalizedType.includes('begin')) {
    return 'start';
  }
  if (normalizedType.includes('end') || normalizedType.includes('finish') || normalizedType.includes('complete')) {
    return 'end';
  }
  if (normalizedType.includes('decision') || normalizedType.includes('gateway') || normalizedType.includes('branch')) {
    return 'decision';
  }
  if (normalizedType.includes('subprocess') || normalizedType.includes('call')) {
    return 'subprocess';
  }

  return 'task';
}

/**
 * Format process variants
 */
function formatVariants(variants: ProcessVariantData[]): ProcessVariantInput[] {
  // Sort by frequency descending
  const sorted = [...variants].sort((a, b) => b.frequency - a.frequency);

  return sorted.slice(0, 5).map((variant, index) => ({
    id: variant.id,
    name: variant.name || `Variant ${index + 1}${variant.isHappyPath ? ' (Happy Path)' : ''}`,
    frequency: Math.round(variant.frequency * 100) / 100,
    stepSequence: variant.steps,
    avgDuration: variant.avgDuration,
  }));
}

/**
 * Format process metrics
 */
function formatMetrics(metrics?: ProcessMetricsData): ProcessMetrics | undefined {
  if (!metrics) return undefined;

  const formatted: ProcessMetrics = {};

  if (metrics.avgCycleTime !== undefined) {
    formatted.avgCycleTime = Math.round(metrics.avgCycleTime);
  }
  if (metrics.minCycleTime !== undefined) {
    formatted.minCycleTime = Math.round(metrics.minCycleTime);
  }
  if (metrics.maxCycleTime !== undefined) {
    formatted.maxCycleTime = Math.round(metrics.maxCycleTime);
  }
  if (metrics.avgSteps !== undefined) {
    formatted.avgSteps = Math.round(metrics.avgSteps * 10) / 10;
  }
  if (metrics.completionRate !== undefined) {
    formatted.completionRate = Math.round(metrics.completionRate * 100) / 100;
  }

  // Format bottlenecks
  if (metrics.bottlenecks && metrics.bottlenecks.length > 0) {
    formatted.bottlenecks = metrics.bottlenecks
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3)
      .map((b) => b.stepName);
  }

  return Object.keys(formatted).length > 0 ? formatted : undefined;
}

/**
 * Format participants list
 */
function formatParticipants(participants: ParticipantData[]): string[] {
  return participants.map((p) => {
    let formatted = p.name;
    if (p.role) {
      formatted += ` (${p.role})`;
    }
    if (p.department) {
      formatted += ` - ${p.department}`;
    }
    return formatted;
  });
}

/**
 * Format systems list
 */
function formatSystems(systems: SystemData[]): string[] {
  return systems.map((s) => {
    let formatted = s.name;
    if (s.type) {
      formatted += ` (${s.type})`;
    }
    if (s.vendor) {
      formatted += ` - ${s.vendor}`;
    }
    return formatted;
  });
}

/**
 * Format documents list
 */
function formatDocuments(documents: DocumentData[]): string[] {
  return documents.map((d) => {
    let formatted = d.name;
    if (d.type) {
      formatted += ` [${d.type}]`;
    }
    return formatted;
  });
}

/**
 * Validate process data completeness
 */
export function validateProcessData(processData: ProcessData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!processData.id) {
    errors.push('Process ID is required');
  }
  if (!processData.name) {
    errors.push('Process name is required');
  }

  // Recommended fields
  if (!processData.description) {
    warnings.push('Process description is missing');
  }
  if (!processData.steps || processData.steps.length === 0) {
    warnings.push('No process steps provided');
  }
  if (!processData.participants || processData.participants.length === 0) {
    warnings.push('No participants identified');
  }

  // Step validation
  if (processData.steps) {
    const hasStart = processData.steps.some((s) =>
      s.type.toLowerCase().includes('start')
    );
    const hasEnd = processData.steps.some((s) =>
      s.type.toLowerCase().includes('end')
    );

    if (!hasStart) {
      warnings.push('No start step identified');
    }
    if (!hasEnd) {
      warnings.push('No end step identified');
    }

    // Check for orphan steps
    const stepIds = new Set(processData.steps.map((s) => s.id));
    for (const step of processData.steps) {
      if (step.transitions) {
        for (const transition of step.transitions) {
          if (!stepIds.has(transition.targetStepId)) {
            warnings.push(`Step "${step.name}" references unknown target step: ${transition.targetStepId}`);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Enrich process data with calculated fields
 */
export function enrichProcessData(processData: ProcessData): ProcessData {
  const enriched = { ...processData };

  // Calculate metrics if not provided
  if (!enriched.metrics && enriched.steps) {
    enriched.metrics = {
      avgSteps: enriched.steps.length,
    };
  }

  // Calculate step frequencies if not provided
  if (enriched.steps) {
    const totalTransitions = enriched.steps.reduce((sum, step) => {
      return sum + (step.transitions?.length || 0);
    }, 0);

    enriched.steps = enriched.steps.map((step) => {
      if (!step.metrics?.frequency && step.transitions) {
        const frequency = totalTransitions > 0
          ? (step.transitions.length / totalTransitions) * 100
          : 0;
        return {
          ...step,
          metrics: {
            ...step.metrics,
            frequency,
          },
        };
      }
      return step;
    });
  }

  // Extract participants from steps if not provided
  if ((!enriched.participants || enriched.participants.length === 0) && enriched.steps) {
    const participantMap = new Map<string, ParticipantData>();

    for (const step of enriched.steps) {
      if (step.performer) {
        const name = typeof step.performer === 'string'
          ? step.performer
          : step.performer.name;

        if (!participantMap.has(name)) {
          participantMap.set(name, {
            id: `participant-${participantMap.size + 1}`,
            name,
            role: typeof step.performer === 'object' ? step.performer.role : undefined,
            stepCount: 1,
          });
        } else {
          const existing = participantMap.get(name)!;
          existing.stepCount = (existing.stepCount || 0) + 1;
        }
      }
    }

    enriched.participants = Array.from(participantMap.values());
  }

  // Extract systems from steps if not provided
  if ((!enriched.systems || enriched.systems.length === 0) && enriched.steps) {
    const systemMap = new Map<string, SystemData>();

    for (const step of enriched.steps) {
      if (step.system) {
        const name = typeof step.system === 'string'
          ? step.system
          : step.system.name;

        if (!systemMap.has(name)) {
          systemMap.set(name, {
            id: `system-${systemMap.size + 1}`,
            name,
            stepCount: 1,
          });
        } else {
          const existing = systemMap.get(name)!;
          existing.stepCount = (existing.stepCount || 0) + 1;
        }
      }
    }

    enriched.systems = Array.from(systemMap.values());
  }

  return enriched;
}

export default formatProcessForSOP;
