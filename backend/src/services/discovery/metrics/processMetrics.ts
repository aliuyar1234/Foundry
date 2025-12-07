/**
 * Process Metrics Calculator
 * Computes process performance and conformance metrics
 */

import { EventLogEntry } from '../algorithms/alphaMiner.js';

export interface ProcessMetrics {
  // Volume metrics
  totalCases: number;
  totalEvents: number;
  uniqueActivities: number;
  traceVariants: number;

  // Time metrics
  avgCaseDuration: number;
  medianCaseDuration: number;
  minCaseDuration: number;
  maxCaseDuration: number;
  avgActivityDuration: Map<string, number>;

  // Frequency metrics
  activityFrequency: Map<string, number>;
  transitionFrequency: Map<string, number>;

  // Performance metrics
  throughput: number; // cases per day
  bottleneckActivities: string[];

  // Conformance metrics
  conformanceRate?: number;
  deviations?: Deviation[];
}

export interface Deviation {
  caseId: string;
  type: 'missing_activity' | 'extra_activity' | 'wrong_order' | 'loop';
  description: string;
  activity?: string;
  position?: number;
}

export interface ActivityMetrics {
  activity: string;
  frequency: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  participantCount: number;
  isBottleneck: boolean;
}

/**
 * Calculate process metrics from event log
 */
export function calculateProcessMetrics(eventLog: EventLogEntry[]): ProcessMetrics {
  if (eventLog.length === 0) {
    return createEmptyMetrics();
  }

  // Group events by case
  const caseEvents = groupEventsByCase(eventLog);

  // Calculate volume metrics
  const activities = new Set(eventLog.map(e => e.activity));
  const traceVariants = calculateTraceVariants(caseEvents);

  // Calculate time metrics
  const caseDurations = calculateCaseDurations(caseEvents);
  const activityDurations = calculateActivityDurations(eventLog);

  // Calculate frequency metrics
  const activityFrequency = calculateActivityFrequency(eventLog);
  const transitionFrequency = calculateTransitionFrequency(caseEvents);

  // Calculate throughput
  const throughput = calculateThroughput(caseEvents);

  // Identify bottlenecks
  const bottleneckActivities = identifyBottlenecks(activityDurations, activityFrequency);

  return {
    totalCases: caseEvents.size,
    totalEvents: eventLog.length,
    uniqueActivities: activities.size,
    traceVariants: traceVariants.size,

    avgCaseDuration: calculateAverage(caseDurations),
    medianCaseDuration: calculateMedian(caseDurations),
    minCaseDuration: Math.min(...caseDurations),
    maxCaseDuration: Math.max(...caseDurations),
    avgActivityDuration: activityDurations,

    activityFrequency,
    transitionFrequency,

    throughput,
    bottleneckActivities,
  };
}

/**
 * Calculate metrics for a specific activity
 */
export function calculateActivityMetrics(
  eventLog: EventLogEntry[],
  activity: string
): ActivityMetrics {
  const activityEvents = eventLog.filter(e => e.activity === activity);

  if (activityEvents.length === 0) {
    return {
      activity,
      frequency: 0,
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      participantCount: 0,
      isBottleneck: false,
    };
  }

  // Group by case to calculate durations
  const caseEvents = groupEventsByCase(eventLog);
  const durations: number[] = [];

  for (const [caseId, events] of caseEvents) {
    const activityEvent = events.find(e => e.activity === activity);
    if (!activityEvent) continue;

    const eventIndex = events.findIndex(e => e === activityEvent);
    if (eventIndex < events.length - 1) {
      const nextEvent = events[eventIndex + 1];
      const duration = nextEvent.timestamp.getTime() - activityEvent.timestamp.getTime();
      durations.push(duration);
    }
  }

  const participants = new Set(activityEvents.map(e => e.actorId).filter(Boolean));

  // Determine if bottleneck
  const avgDuration = durations.length > 0 ? calculateAverage(durations) : 0;
  const allDurations = calculateActivityDurations(eventLog);
  const avgAllDurations = Array.from(allDurations.values());
  const overallAvg = avgAllDurations.length > 0 ? calculateAverage(avgAllDurations) : 0;
  const isBottleneck = avgDuration > overallAvg * 1.5;

  return {
    activity,
    frequency: activityEvents.length,
    avgDuration,
    minDuration: durations.length > 0 ? Math.min(...durations) : 0,
    maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
    participantCount: participants.size,
    isBottleneck,
  };
}

/**
 * Calculate conformance against a reference model
 */
export function calculateConformance(
  eventLog: EventLogEntry[],
  expectedSequence: string[]
): { conformanceRate: number; deviations: Deviation[] } {
  const caseEvents = groupEventsByCase(eventLog);
  const deviations: Deviation[] = [];
  let conformingCases = 0;

  for (const [caseId, events] of caseEvents) {
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const actualSequence = events.map(e => e.activity);

    const caseDeviations = findDeviations(caseId, actualSequence, expectedSequence);
    if (caseDeviations.length === 0) {
      conformingCases++;
    } else {
      deviations.push(...caseDeviations);
    }
  }

  return {
    conformanceRate: caseEvents.size > 0 ? conformingCases / caseEvents.size : 1,
    deviations,
  };
}

/**
 * Find deviations between actual and expected sequences
 */
function findDeviations(
  caseId: string,
  actual: string[],
  expected: string[]
): Deviation[] {
  const deviations: Deviation[] = [];

  // Check for missing activities
  for (const activity of expected) {
    if (!actual.includes(activity)) {
      deviations.push({
        caseId,
        type: 'missing_activity',
        description: `Missing activity: ${activity}`,
        activity,
      });
    }
  }

  // Check for extra activities
  for (const activity of actual) {
    if (!expected.includes(activity)) {
      deviations.push({
        caseId,
        type: 'extra_activity',
        description: `Unexpected activity: ${activity}`,
        activity,
      });
    }
  }

  // Check for wrong order
  let expectedIndex = 0;
  for (let i = 0; i < actual.length; i++) {
    const activity = actual[i];
    const expectedPosition = expected.indexOf(activity, expectedIndex);

    if (expectedPosition !== -1 && expectedPosition < expectedIndex) {
      deviations.push({
        caseId,
        type: 'wrong_order',
        description: `Activity ${activity} occurred out of order`,
        activity,
        position: i,
      });
    } else if (expectedPosition !== -1) {
      expectedIndex = expectedPosition + 1;
    }
  }

  // Check for loops (repeated activities)
  const activityCounts = new Map<string, number>();
  for (const activity of actual) {
    activityCounts.set(activity, (activityCounts.get(activity) || 0) + 1);
  }

  for (const [activity, count] of activityCounts) {
    const expectedCount = expected.filter(a => a === activity).length;
    if (count > expectedCount) {
      deviations.push({
        caseId,
        type: 'loop',
        description: `Activity ${activity} repeated ${count - expectedCount} extra times`,
        activity,
      });
    }
  }

  return deviations;
}

// Helper functions

function groupEventsByCase(eventLog: EventLogEntry[]): Map<string, EventLogEntry[]> {
  const caseEvents = new Map<string, EventLogEntry[]>();
  for (const event of eventLog) {
    const events = caseEvents.get(event.caseId) || [];
    events.push(event);
    caseEvents.set(event.caseId, events);
  }

  // Sort events within each case
  for (const events of caseEvents.values()) {
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  return caseEvents;
}

function calculateTraceVariants(caseEvents: Map<string, EventLogEntry[]>): Map<string, number> {
  const variants = new Map<string, number>();
  for (const events of caseEvents.values()) {
    const trace = events.map(e => e.activity).join(' -> ');
    variants.set(trace, (variants.get(trace) || 0) + 1);
  }
  return variants;
}

function calculateCaseDurations(caseEvents: Map<string, EventLogEntry[]>): number[] {
  const durations: number[] = [];
  for (const events of caseEvents.values()) {
    if (events.length < 2) continue;
    const duration = events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime();
    durations.push(duration);
  }
  return durations;
}

function calculateActivityDurations(eventLog: EventLogEntry[]): Map<string, number> {
  const caseEvents = groupEventsByCase(eventLog);
  const activityDurations = new Map<string, number[]>();

  for (const events of caseEvents.values()) {
    for (let i = 0; i < events.length - 1; i++) {
      const activity = events[i].activity;
      const duration = events[i + 1].timestamp.getTime() - events[i].timestamp.getTime();

      const durations = activityDurations.get(activity) || [];
      durations.push(duration);
      activityDurations.set(activity, durations);
    }
  }

  const avgDurations = new Map<string, number>();
  for (const [activity, durations] of activityDurations) {
    avgDurations.set(activity, calculateAverage(durations));
  }

  return avgDurations;
}

function calculateActivityFrequency(eventLog: EventLogEntry[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const event of eventLog) {
    frequency.set(event.activity, (frequency.get(event.activity) || 0) + 1);
  }
  return frequency;
}

function calculateTransitionFrequency(caseEvents: Map<string, EventLogEntry[]>): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const events of caseEvents.values()) {
    for (let i = 0; i < events.length - 1; i++) {
      const transition = `${events[i].activity} -> ${events[i + 1].activity}`;
      frequency.set(transition, (frequency.get(transition) || 0) + 1);
    }
  }

  return frequency;
}

function calculateThroughput(caseEvents: Map<string, EventLogEntry[]>): number {
  if (caseEvents.size === 0) return 0;

  let minTimestamp = Infinity;
  let maxTimestamp = -Infinity;

  for (const events of caseEvents.values()) {
    for (const event of events) {
      const time = event.timestamp.getTime();
      minTimestamp = Math.min(minTimestamp, time);
      maxTimestamp = Math.max(maxTimestamp, time);
    }
  }

  const daysDiff = (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24);
  return daysDiff > 0 ? caseEvents.size / daysDiff : caseEvents.size;
}

function identifyBottlenecks(
  activityDurations: Map<string, number>,
  activityFrequency: Map<string, number>
): string[] {
  if (activityDurations.size === 0) return [];

  const durations = Array.from(activityDurations.values());
  const avgDuration = calculateAverage(durations);
  const threshold = avgDuration * 1.5;

  const bottlenecks: string[] = [];
  for (const [activity, duration] of activityDurations) {
    if (duration > threshold) {
      bottlenecks.push(activity);
    }
  }

  return bottlenecks;
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function createEmptyMetrics(): ProcessMetrics {
  return {
    totalCases: 0,
    totalEvents: 0,
    uniqueActivities: 0,
    traceVariants: 0,
    avgCaseDuration: 0,
    medianCaseDuration: 0,
    minCaseDuration: 0,
    maxCaseDuration: 0,
    avgActivityDuration: new Map(),
    activityFrequency: new Map(),
    transitionFrequency: new Map(),
    throughput: 0,
    bottleneckActivities: [],
  };
}
