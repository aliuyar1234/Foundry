/**
 * Real-Time Workload Tracker Service
 * T040 - Implement real-time workload tracker
 *
 * Tracks and maintains real-time workload state for routing decisions
 */

import { EventEmitter } from 'events';
import { logger } from '../../lib/logger.js';
import {
  calculateWorkloadScore,
  calculateCapacityRemaining,
  type ActivityData,
} from './workloadAnalyzer.js';
import type { WorkloadSnapshot, WorkloadAlert, WorkloadAlertType } from 'shared/types/workload.js';

// =============================================================================
// Types
// =============================================================================

interface PersonWorkloadState {
  personId: string;
  personName: string;
  organizationId: string;
  department?: string;
  team?: string;

  // Current activity counts
  activeTasks: number;
  pendingTasks: number;
  emailsToday: number;
  messagesToday: number;
  meetingsToday: number;
  meetingHoursToday: number;

  // Calculated scores
  workloadScore: number;
  burnoutRiskScore: number;
  capacityRemaining: number;

  // Status
  isAvailable: boolean;
  lastActivityAt: Date;
  lastUpdatedAt: Date;

  // Trend tracking
  workloadHistory: number[]; // Last N scores
}

interface WorkloadEvent {
  type: WorkloadEventType;
  personId: string;
  organizationId: string;
  delta: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

type WorkloadEventType =
  | 'task_assigned'
  | 'task_completed'
  | 'task_removed'
  | 'email_received'
  | 'email_sent'
  | 'message_received'
  | 'message_sent'
  | 'meeting_started'
  | 'meeting_ended'
  | 'meeting_scheduled'
  | 'request_assigned'
  | 'request_completed'
  | 'availability_changed';

// =============================================================================
// WorkloadTracker Class
// =============================================================================

export class WorkloadTracker extends EventEmitter {
  private states: Map<string, PersonWorkloadState> = new Map();
  private organizationStates: Map<string, Map<string, PersonWorkloadState>> =
    new Map();
  private updateQueue: WorkloadEvent[] = [];
  private isProcessing: boolean = false;
  private flushInterval: NodeJS.Timeout | null = null;
  private historyLength: number = 24; // Keep 24 data points for trend

  // Thresholds for alerts
  private readonly alertThresholds = {
    highWorkload: 80,
    criticalWorkload: 95,
    lowCapacity: 20,
    criticalCapacity: 5,
    burnoutWarning: 60,
    burnoutCritical: 80,
  };

  constructor() {
    super();
    this.startBackgroundProcessing();
  }

  /**
   * Start background processing of workload updates
   */
  private startBackgroundProcessing(): void {
    // Process queued updates every 5 seconds
    this.flushInterval = setInterval(() => {
      this.processQueuedUpdates();
    }, 5000);

    logger.info('Workload tracker background processing started');
  }

  /**
   * Stop background processing
   */
  public stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    logger.info('Workload tracker stopped');
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get or create state key
   */
  private getStateKey(organizationId: string, personId: string): string {
    return `${organizationId}:${personId}`;
  }

  /**
   * Initialize workload state for a person
   */
  public initializeState(
    organizationId: string,
    personId: string,
    personName: string,
    initialData?: Partial<PersonWorkloadState>
  ): PersonWorkloadState {
    const key = this.getStateKey(organizationId, personId);

    const state: PersonWorkloadState = {
      personId,
      personName,
      organizationId,
      department: initialData?.department,
      team: initialData?.team,

      activeTasks: initialData?.activeTasks || 0,
      pendingTasks: initialData?.pendingTasks || 0,
      emailsToday: initialData?.emailsToday || 0,
      messagesToday: initialData?.messagesToday || 0,
      meetingsToday: initialData?.meetingsToday || 0,
      meetingHoursToday: initialData?.meetingHoursToday || 0,

      workloadScore: initialData?.workloadScore || 0,
      burnoutRiskScore: initialData?.burnoutRiskScore || 0,
      capacityRemaining: initialData?.capacityRemaining || 100,

      isAvailable: initialData?.isAvailable ?? true,
      lastActivityAt: initialData?.lastActivityAt || new Date(),
      lastUpdatedAt: new Date(),

      workloadHistory: initialData?.workloadHistory || [],
    };

    // Recalculate scores
    this.recalculateScores(state);

    this.states.set(key, state);

    // Update organization index
    if (!this.organizationStates.has(organizationId)) {
      this.organizationStates.set(organizationId, new Map());
    }
    this.organizationStates.get(organizationId)!.set(personId, state);

    return state;
  }

  /**
   * Get current state for a person
   */
  public getState(
    organizationId: string,
    personId: string
  ): PersonWorkloadState | null {
    const key = this.getStateKey(organizationId, personId);
    return this.states.get(key) || null;
  }

  /**
   * Get all states for an organization
   */
  public getOrganizationStates(
    organizationId: string
  ): PersonWorkloadState[] {
    const orgStates = this.organizationStates.get(organizationId);
    if (!orgStates) return [];
    return Array.from(orgStates.values());
  }

  /**
   * Get available people with capacity
   */
  public getAvailableWithCapacity(
    organizationId: string,
    minCapacity: number = 20
  ): PersonWorkloadState[] {
    return this.getOrganizationStates(organizationId)
      .filter(
        (state) =>
          state.isAvailable &&
          state.capacityRemaining >= minCapacity &&
          state.workloadScore < this.alertThresholds.criticalWorkload
      )
      .sort((a, b) => b.capacityRemaining - a.capacityRemaining);
  }

  // ==========================================================================
  // Event Processing
  // ==========================================================================

  /**
   * Record a workload event
   */
  public recordEvent(event: WorkloadEvent): void {
    this.updateQueue.push(event);

    // Process immediately if queue is getting large
    if (this.updateQueue.length > 100) {
      this.processQueuedUpdates();
    }
  }

  /**
   * Process queued workload updates
   */
  private async processQueuedUpdates(): Promise<void> {
    if (this.isProcessing || this.updateQueue.length === 0) return;

    this.isProcessing = true;
    const events = [...this.updateQueue];
    this.updateQueue = [];

    try {
      // Group events by person
      const byPerson = new Map<string, WorkloadEvent[]>();
      for (const event of events) {
        const key = this.getStateKey(event.organizationId, event.personId);
        const existing = byPerson.get(key) || [];
        existing.push(event);
        byPerson.set(key, existing);
      }

      // Process each person's events
      for (const [key, personEvents] of byPerson) {
        const state = this.states.get(key);
        if (!state) continue;

        for (const event of personEvents) {
          this.applyEvent(state, event);
        }

        // Recalculate scores
        this.recalculateScores(state);

        // Check for alerts
        this.checkAlerts(state);

        // Emit update event
        this.emit('workload_updated', {
          personId: state.personId,
          organizationId: state.organizationId,
          workloadScore: state.workloadScore,
          capacityRemaining: state.capacityRemaining,
          isAvailable: state.isAvailable,
        });
      }
    } catch (error) {
      logger.error({ error }, 'Error processing workload updates');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Apply a single event to state
   */
  private applyEvent(state: PersonWorkloadState, event: WorkloadEvent): void {
    switch (event.type) {
      case 'task_assigned':
        state.activeTasks += event.delta;
        break;
      case 'task_completed':
      case 'task_removed':
        state.activeTasks = Math.max(0, state.activeTasks - event.delta);
        break;
      case 'email_received':
      case 'email_sent':
        state.emailsToday += event.delta;
        break;
      case 'message_received':
      case 'message_sent':
        state.messagesToday += event.delta;
        break;
      case 'meeting_started':
        state.meetingsToday += 1;
        break;
      case 'meeting_ended':
        state.meetingHoursToday += event.delta; // delta = duration in hours
        break;
      case 'meeting_scheduled':
        // Could track future meetings
        break;
      case 'request_assigned':
        state.pendingTasks += event.delta;
        break;
      case 'request_completed':
        state.pendingTasks = Math.max(0, state.pendingTasks - event.delta);
        break;
      case 'availability_changed':
        state.isAvailable = event.delta === 1;
        break;
    }

    state.lastActivityAt = event.timestamp;
    state.lastUpdatedAt = new Date();
  }

  /**
   * Recalculate workload scores
   */
  private recalculateScores(state: PersonWorkloadState): void {
    const activity: ActivityData = {
      activeTasks: state.activeTasks,
      pendingTasks: state.pendingTasks,
      emailsReceived: Math.floor(state.emailsToday / 2), // Approximate split
      emailsSent: Math.ceil(state.emailsToday / 2),
      messagesReceived: Math.floor(state.messagesToday / 2),
      messagesSent: Math.ceil(state.messagesToday / 2),
      meetingsAttended: state.meetingsToday,
      meetingHours: state.meetingHoursToday,
      completedTasksToday: 0, // Would need to track separately
    };

    state.workloadScore = calculateWorkloadScore(activity);
    state.capacityRemaining = calculateCapacityRemaining(state.workloadScore);

    // Update history
    state.workloadHistory.push(state.workloadScore);
    if (state.workloadHistory.length > this.historyLength) {
      state.workloadHistory.shift();
    }

    // Simple burnout risk based on workload trend
    if (state.workloadHistory.length >= 3) {
      const recent = state.workloadHistory.slice(-3);
      const trend = recent[2] - recent[0];
      state.burnoutRiskScore = Math.min(
        100,
        state.workloadScore + (trend > 0 ? trend * 0.5 : 0)
      );
    } else {
      state.burnoutRiskScore = state.workloadScore;
    }

    // Update availability based on capacity
    if (state.capacityRemaining < this.alertThresholds.criticalCapacity) {
      state.isAvailable = false;
    }
  }

  /**
   * Check and emit alerts
   */
  private checkAlerts(state: PersonWorkloadState): void {
    const alerts: Array<{ type: WorkloadAlertType; severity: 'info' | 'warning' | 'critical' }> = [];

    // Burnout risk alerts
    if (state.burnoutRiskScore >= this.alertThresholds.burnoutCritical) {
      alerts.push({ type: 'burnout_risk_critical', severity: 'critical' });
    } else if (state.burnoutRiskScore >= this.alertThresholds.burnoutWarning) {
      alerts.push({ type: 'burnout_risk_high', severity: 'warning' });
    }

    // Capacity alerts
    if (state.capacityRemaining <= this.alertThresholds.criticalCapacity) {
      alerts.push({ type: 'capacity_exceeded', severity: 'critical' });
    } else if (state.capacityRemaining <= this.alertThresholds.lowCapacity) {
      alerts.push({ type: 'capacity_exceeded', severity: 'warning' });
    }

    // Meeting overload
    if (state.meetingHoursToday > 6) {
      alerts.push({ type: 'meeting_overload', severity: 'warning' });
    }

    // Emit alerts
    for (const alert of alerts) {
      this.emit('workload_alert', {
        ...alert,
        personId: state.personId,
        organizationId: state.organizationId,
        workloadScore: state.workloadScore,
        capacityRemaining: state.capacityRemaining,
        timestamp: new Date(),
      });
    }
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Record task assigned
   */
  public taskAssigned(
    organizationId: string,
    personId: string,
    count: number = 1
  ): void {
    this.recordEvent({
      type: 'task_assigned',
      organizationId,
      personId,
      delta: count,
      timestamp: new Date(),
    });
  }

  /**
   * Record task completed
   */
  public taskCompleted(
    organizationId: string,
    personId: string,
    count: number = 1
  ): void {
    this.recordEvent({
      type: 'task_completed',
      organizationId,
      personId,
      delta: count,
      timestamp: new Date(),
    });
  }

  /**
   * Record email activity
   */
  public emailActivity(
    organizationId: string,
    personId: string,
    direction: 'received' | 'sent',
    count: number = 1
  ): void {
    this.recordEvent({
      type: direction === 'received' ? 'email_received' : 'email_sent',
      organizationId,
      personId,
      delta: count,
      timestamp: new Date(),
    });
  }

  /**
   * Record message activity
   */
  public messageActivity(
    organizationId: string,
    personId: string,
    direction: 'received' | 'sent',
    count: number = 1
  ): void {
    this.recordEvent({
      type: direction === 'received' ? 'message_received' : 'message_sent',
      organizationId,
      personId,
      delta: count,
      timestamp: new Date(),
    });
  }

  /**
   * Record meeting ended
   */
  public meetingEnded(
    organizationId: string,
    personId: string,
    durationHours: number
  ): void {
    this.recordEvent({
      type: 'meeting_ended',
      organizationId,
      personId,
      delta: durationHours,
      timestamp: new Date(),
    });
  }

  /**
   * Record request assigned (routing)
   */
  public requestAssigned(organizationId: string, personId: string): void {
    this.recordEvent({
      type: 'request_assigned',
      organizationId,
      personId,
      delta: 1,
      timestamp: new Date(),
    });
  }

  /**
   * Record request completed
   */
  public requestCompleted(organizationId: string, personId: string): void {
    this.recordEvent({
      type: 'request_completed',
      organizationId,
      personId,
      delta: 1,
      timestamp: new Date(),
    });
  }

  /**
   * Set availability status
   */
  public setAvailability(
    organizationId: string,
    personId: string,
    isAvailable: boolean
  ): void {
    this.recordEvent({
      type: 'availability_changed',
      organizationId,
      personId,
      delta: isAvailable ? 1 : 0,
      timestamp: new Date(),
    });
  }

  // ==========================================================================
  // Snapshot & Export
  // ==========================================================================

  /**
   * Get current workload snapshot for a person
   */
  public getSnapshot(
    organizationId: string,
    personId: string
  ): WorkloadSnapshot | null {
    const state = this.getState(organizationId, personId);
    if (!state) return null;

    return {
      personId: state.personId,
      timestamp: state.lastUpdatedAt,
      workloadScore: state.workloadScore,
      burnoutRiskScore: state.burnoutRiskScore,
      activeTasks: state.activeTasks,
      meetingLoad: state.meetingHoursToday,
      communicationVolume: state.emailsToday + state.messagesToday,
    };
  }

  /**
   * Get snapshots for all people in organization
   */
  public getOrganizationSnapshots(organizationId: string): WorkloadSnapshot[] {
    return this.getOrganizationStates(organizationId).map((state) => ({
      personId: state.personId,
      timestamp: state.lastUpdatedAt,
      workloadScore: state.workloadScore,
      burnoutRiskScore: state.burnoutRiskScore,
      activeTasks: state.activeTasks,
      meetingLoad: state.meetingHoursToday,
      communicationVolume: state.emailsToday + state.messagesToday,
    }));
  }

  /**
   * Reset daily counters (should be called at start of each day)
   */
  public resetDailyCounters(organizationId?: string): void {
    const states = organizationId
      ? this.getOrganizationStates(organizationId)
      : Array.from(this.states.values());

    for (const state of states) {
      state.emailsToday = 0;
      state.messagesToday = 0;
      state.meetingsToday = 0;
      state.meetingHoursToday = 0;
      state.lastUpdatedAt = new Date();
      this.recalculateScores(state);
    }

    logger.info(
      { organizationId, count: states.length },
      'Reset daily workload counters'
    );
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: WorkloadTracker | null = null;

export function getWorkloadTracker(): WorkloadTracker {
  if (!instance) {
    instance = new WorkloadTracker();
  }
  return instance;
}

export function stopWorkloadTracker(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

export default {
  WorkloadTracker,
  getWorkloadTracker,
  stopWorkloadTracker,
};
