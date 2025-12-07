/**
 * Alpha Miner Algorithm Implementation
 * Discovers process models from event logs using the Alpha algorithm
 */

export interface EventLogEntry {
  caseId: string;
  activity: string;
  timestamp: Date;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessModel {
  id: string;
  name: string;
  activities: Set<string>;
  startActivities: Set<string>;
  endActivities: Set<string>;
  directSuccession: Map<string, Set<string>>;
  causality: Map<string, Set<string>>;
  parallelism: Set<string>;
  places: Place[];
  transitions: Transition[];
  arcs: Arc[];
}

export interface Place {
  id: string;
  name: string;
  inputTransitions: string[];
  outputTransitions: string[];
}

export interface Transition {
  id: string;
  name: string;
  activity: string;
  frequency: number;
}

export interface Arc {
  id: string;
  source: string;
  target: string;
  type: 'place-to-transition' | 'transition-to-place';
}

export interface Footprint {
  activities: string[];
  directSuccession: Map<string, Set<string>>;
  causality: Map<string, Set<string>>;
  parallelism: Set<string>;
  noRelation: Set<string>;
}

/**
 * Alpha Miner class
 * Implements the Alpha algorithm for process discovery
 */
export class AlphaMiner {
  private eventLog: EventLogEntry[];
  private traces: Map<string, string[]>;

  constructor(eventLog: EventLogEntry[]) {
    this.eventLog = eventLog;
    this.traces = this.buildTraces();
  }

  /**
   * Build traces from event log
   */
  private buildTraces(): Map<string, string[]> {
    const traces = new Map<string, string[]>();

    // Group events by case
    const caseEvents = new Map<string, EventLogEntry[]>();
    for (const event of this.eventLog) {
      const events = caseEvents.get(event.caseId) || [];
      events.push(event);
      caseEvents.set(event.caseId, events);
    }

    // Sort events within each case and extract activity sequence
    for (const [caseId, events] of caseEvents) {
      events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      traces.set(caseId, events.map(e => e.activity));
    }

    return traces;
  }

  /**
   * Mine process model from event log
   */
  mine(): ProcessModel {
    const footprint = this.computeFootprint();
    const model = this.constructPetriNet(footprint);
    return model;
  }

  /**
   * Compute footprint matrix
   */
  computeFootprint(): Footprint {
    const activities = this.getActivities();
    const directSuccession = this.computeDirectSuccession();
    const causality = this.computeCausality(directSuccession);
    const parallelism = this.computeParallelism(directSuccession);
    const noRelation = this.computeNoRelation(activities, directSuccession, causality, parallelism);

    return {
      activities: Array.from(activities),
      directSuccession,
      causality,
      parallelism,
      noRelation,
    };
  }

  /**
   * Get all unique activities
   */
  private getActivities(): Set<string> {
    const activities = new Set<string>();
    for (const event of this.eventLog) {
      activities.add(event.activity);
    }
    return activities;
  }

  /**
   * Get start activities (first activity in traces)
   */
  getStartActivities(): Set<string> {
    const startActivities = new Set<string>();
    for (const trace of this.traces.values()) {
      if (trace.length > 0) {
        startActivities.add(trace[0]);
      }
    }
    return startActivities;
  }

  /**
   * Get end activities (last activity in traces)
   */
  getEndActivities(): Set<string> {
    const endActivities = new Set<string>();
    for (const trace of this.traces.values()) {
      if (trace.length > 0) {
        endActivities.add(trace[trace.length - 1]);
      }
    }
    return endActivities;
  }

  /**
   * Compute direct succession relation (a > b)
   * a directly follows b in at least one trace
   */
  private computeDirectSuccession(): Map<string, Set<string>> {
    const directSuccession = new Map<string, Set<string>>();

    for (const trace of this.traces.values()) {
      for (let i = 0; i < trace.length - 1; i++) {
        const current = trace[i];
        const next = trace[i + 1];

        if (!directSuccession.has(current)) {
          directSuccession.set(current, new Set());
        }
        directSuccession.get(current)!.add(next);
      }
    }

    return directSuccession;
  }

  /**
   * Compute causality relation (a -> b)
   * a > b and not b > a
   */
  private computeCausality(
    directSuccession: Map<string, Set<string>>
  ): Map<string, Set<string>> {
    const causality = new Map<string, Set<string>>();

    for (const [a, successors] of directSuccession) {
      for (const b of successors) {
        const bSuccessors = directSuccession.get(b) || new Set();
        // a -> b if a > b and not b > a
        if (!bSuccessors.has(a)) {
          if (!causality.has(a)) {
            causality.set(a, new Set());
          }
          causality.get(a)!.add(b);
        }
      }
    }

    return causality;
  }

  /**
   * Compute parallelism relation (a || b)
   * a > b and b > a
   */
  private computeParallelism(
    directSuccession: Map<string, Set<string>>
  ): Set<string> {
    const parallelism = new Set<string>();

    for (const [a, successors] of directSuccession) {
      for (const b of successors) {
        const bSuccessors = directSuccession.get(b) || new Set();
        // a || b if a > b and b > a
        if (bSuccessors.has(a)) {
          parallelism.add(`${a}|${b}`);
          parallelism.add(`${b}|${a}`);
        }
      }
    }

    return parallelism;
  }

  /**
   * Compute no relation (a # b)
   * neither a > b nor b > a
   */
  private computeNoRelation(
    activities: Set<string>,
    directSuccession: Map<string, Set<string>>,
    causality: Map<string, Set<string>>,
    parallelism: Set<string>
  ): Set<string> {
    const noRelation = new Set<string>();

    for (const a of activities) {
      for (const b of activities) {
        if (a === b) continue;

        const aSuccessors = directSuccession.get(a) || new Set();
        const bSuccessors = directSuccession.get(b) || new Set();

        // a # b if not a > b and not b > a
        if (!aSuccessors.has(b) && !bSuccessors.has(a)) {
          noRelation.add(`${a}#${b}`);
        }
      }
    }

    return noRelation;
  }

  /**
   * Construct Petri net from footprint
   */
  private constructPetriNet(footprint: Footprint): ProcessModel {
    const places: Place[] = [];
    const transitions: Transition[] = [];
    const arcs: Arc[] = [];

    // Create transitions for each activity
    const activityFrequency = this.computeActivityFrequency();
    for (const activity of footprint.activities) {
      transitions.push({
        id: `t_${activity}`,
        name: activity,
        activity,
        frequency: activityFrequency.get(activity) || 0,
      });
    }

    // Create start place
    const startPlace: Place = {
      id: 'p_start',
      name: 'Start',
      inputTransitions: [],
      outputTransitions: [],
    };
    places.push(startPlace);

    // Connect start place to start activities
    const startActivities = this.getStartActivities();
    for (const activity of startActivities) {
      startPlace.outputTransitions.push(`t_${activity}`);
      arcs.push({
        id: `arc_start_${activity}`,
        source: 'p_start',
        target: `t_${activity}`,
        type: 'place-to-transition',
      });
    }

    // Create end place
    const endPlace: Place = {
      id: 'p_end',
      name: 'End',
      inputTransitions: [],
      outputTransitions: [],
    };
    places.push(endPlace);

    // Connect end activities to end place
    const endActivities = this.getEndActivities();
    for (const activity of endActivities) {
      endPlace.inputTransitions.push(`t_${activity}`);
      arcs.push({
        id: `arc_${activity}_end`,
        source: `t_${activity}`,
        target: 'p_end',
        type: 'transition-to-place',
      });
    }

    // Create places for causal relations
    let placeCounter = 0;
    for (const [a, successors] of footprint.causality) {
      for (const b of successors) {
        placeCounter++;
        const place: Place = {
          id: `p_${placeCounter}`,
          name: `${a} -> ${b}`,
          inputTransitions: [`t_${a}`],
          outputTransitions: [`t_${b}`],
        };
        places.push(place);

        arcs.push({
          id: `arc_${a}_p${placeCounter}`,
          source: `t_${a}`,
          target: `p_${placeCounter}`,
          type: 'transition-to-place',
        });

        arcs.push({
          id: `arc_p${placeCounter}_${b}`,
          source: `p_${placeCounter}`,
          target: `t_${b}`,
          type: 'place-to-transition',
        });
      }
    }

    return {
      id: `process_${Date.now()}`,
      name: 'Discovered Process',
      activities: new Set(footprint.activities),
      startActivities,
      endActivities: this.getEndActivities(),
      directSuccession: footprint.directSuccession,
      causality: footprint.causality,
      parallelism: footprint.parallelism,
      places,
      transitions,
      arcs,
    };
  }

  /**
   * Compute activity frequency
   */
  private computeActivityFrequency(): Map<string, number> {
    const frequency = new Map<string, number>();
    for (const event of this.eventLog) {
      frequency.set(event.activity, (frequency.get(event.activity) || 0) + 1);
    }
    return frequency;
  }

  /**
   * Get trace variants with counts
   */
  getTraceVariants(): Map<string, number> {
    const variants = new Map<string, number>();
    for (const trace of this.traces.values()) {
      const key = trace.join(' -> ');
      variants.set(key, (variants.get(key) || 0) + 1);
    }
    return variants;
  }

  /**
   * Get statistics about the event log
   */
  getStatistics(): {
    totalEvents: number;
    totalCases: number;
    uniqueActivities: number;
    traceVariants: number;
    avgTraceLength: number;
  } {
    const activities = this.getActivities();
    const variants = this.getTraceVariants();

    let totalLength = 0;
    for (const trace of this.traces.values()) {
      totalLength += trace.length;
    }

    return {
      totalEvents: this.eventLog.length,
      totalCases: this.traces.size,
      uniqueActivities: activities.size,
      traceVariants: variants.size,
      avgTraceLength: this.traces.size > 0 ? totalLength / this.traces.size : 0,
    };
  }
}

/**
 * Discover process from event log
 */
export function discoverProcess(eventLog: EventLogEntry[]): ProcessModel {
  const miner = new AlphaMiner(eventLog);
  return miner.mine();
}
