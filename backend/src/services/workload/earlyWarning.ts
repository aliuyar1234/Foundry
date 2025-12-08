/**
 * Early Warning System
 * T215 - Detect and alert on early burnout indicators
 *
 * Monitors workload signals and generates proactive alerts
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

// =============================================================================
// Types
// =============================================================================

export interface EarlyWarning {
  id: string;
  personId: string;
  personName: string;
  type: WarningType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  detectedAt: Date;
  signals: WarningSignal[];
  suggestedActions: SuggestedAction[];
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  resolvedAt?: Date;
}

export type WarningType =
  | 'workload_spike'
  | 'sustained_overload'
  | 'after_hours_pattern'
  | 'communication_surge'
  | 'deadline_cluster'
  | 'isolation_detected'
  | 'declining_performance'
  | 'missed_breaks'
  | 'response_pressure'
  | 'burnout_trajectory';

export interface WarningSignal {
  metric: string;
  currentValue: number;
  threshold: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  description: string;
}

export interface SuggestedAction {
  action: string;
  priority: 'immediate' | 'soon' | 'when_possible';
  owner: 'individual' | 'manager' | 'team';
  expectedImpact: string;
}

export interface WarningConfig {
  enabledTypes?: WarningType[];
  sensitivityLevel?: 'low' | 'medium' | 'high';
  checkIntervalMinutes?: number;
  lookbackDays?: number;
  alertChannels?: ('in_app' | 'email' | 'slack')[];
}

export interface TeamWarningsSummary {
  teamId: string;
  checkedAt: Date;
  activeWarnings: number;
  criticalWarnings: number;
  warnings: EarlyWarning[];
  riskTrend: 'improving' | 'stable' | 'worsening';
  topConcerns: string[];
}

// =============================================================================
// Early Warning System
// =============================================================================

const prisma = new PrismaClient();

// Warning thresholds by sensitivity
const THRESHOLDS = {
  low: {
    workload_spike: 130,
    sustained_overload_days: 10,
    after_hours_percent: 25,
    communication_surge: 200,
    deadline_cluster_count: 5,
    isolation_interaction_min: 3,
    performance_decline: 30,
    missed_breaks_days: 5,
    response_pressure_minutes: 15,
  },
  medium: {
    workload_spike: 115,
    sustained_overload_days: 7,
    after_hours_percent: 15,
    communication_surge: 150,
    deadline_cluster_count: 4,
    isolation_interaction_min: 5,
    performance_decline: 20,
    missed_breaks_days: 3,
    response_pressure_minutes: 20,
  },
  high: {
    workload_spike: 100,
    sustained_overload_days: 5,
    after_hours_percent: 10,
    communication_surge: 100,
    deadline_cluster_count: 3,
    isolation_interaction_min: 7,
    performance_decline: 15,
    missed_breaks_days: 2,
    response_pressure_minutes: 30,
  },
};

// Event emitter for warning notifications
const warningEmitter = new EventEmitter();

/**
 * Check for early warning signals for a person
 */
export async function checkForWarnings(
  personId: string,
  config: WarningConfig = {}
): Promise<EarlyWarning[]> {
  const {
    enabledTypes = Object.keys(THRESHOLDS.medium) as WarningType[],
    sensitivityLevel = 'medium',
    lookbackDays = 14,
  } = config;

  const user = await prisma.user.findUnique({
    where: { id: personId },
  });

  if (!user) {
    return [];
  }

  const warnings: EarlyWarning[] = [];
  const thresholds = THRESHOLDS[sensitivityLevel];

  // Check each warning type
  for (const warningType of enabledTypes) {
    const warning = await checkWarningType(
      personId,
      user.name || user.email,
      warningType as WarningType,
      thresholds,
      lookbackDays
    );

    if (warning) {
      warnings.push(warning);
    }
  }

  // Emit events for critical warnings
  for (const warning of warnings.filter(w => w.severity === 'critical')) {
    warningEmitter.emit('warning', warning);
  }

  return warnings;
}

/**
 * Check for warnings across a team
 */
export async function checkTeamWarnings(
  teamId: string,
  config: WarningConfig = {}
): Promise<TeamWarningsSummary> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const allWarnings: EarlyWarning[] = [];

  for (const user of team.users) {
    const userWarnings = await checkForWarnings(user.id, config);
    allWarnings.push(...userWarnings);
  }

  // Aggregate top concerns
  const concernCounts = new Map<string, number>();
  for (const warning of allWarnings) {
    const count = concernCounts.get(warning.type) || 0;
    concernCounts.set(warning.type, count + 1);
  }

  const topConcerns = Array.from(concernCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${formatWarningType(type)}: ${count} affected`);

  // Determine risk trend
  const criticalCount = allWarnings.filter(w => w.severity === 'critical').length;
  const warningCount = allWarnings.filter(w => w.severity === 'warning').length;
  const riskTrend = criticalCount > 2 ? 'worsening' : warningCount > team.users.length ? 'worsening' : 'stable';

  return {
    teamId,
    checkedAt: new Date(),
    activeWarnings: allWarnings.length,
    criticalWarnings: criticalCount,
    warnings: allWarnings,
    riskTrend,
    topConcerns,
  };
}

/**
 * Acknowledge a warning
 */
export async function acknowledgeWarning(
  warningId: string,
  acknowledgedBy: string
): Promise<EarlyWarning> {
  // In production, update in database
  return {
    id: warningId,
    personId: 'person-1',
    personName: 'Team Member',
    type: 'workload_spike',
    severity: 'warning',
    title: 'Warning Acknowledged',
    description: 'Warning has been acknowledged',
    detectedAt: new Date(),
    signals: [],
    suggestedActions: [],
    status: 'acknowledged',
    acknowledgedBy,
  };
}

/**
 * Resolve a warning
 */
export async function resolveWarning(
  warningId: string,
  resolution: string
): Promise<EarlyWarning> {
  // In production, update in database
  return {
    id: warningId,
    personId: 'person-1',
    personName: 'Team Member',
    type: 'workload_spike',
    severity: 'warning',
    title: 'Warning Resolved',
    description: resolution,
    detectedAt: new Date(),
    signals: [],
    suggestedActions: [],
    status: 'resolved',
    resolvedAt: new Date(),
  };
}

/**
 * Subscribe to warning events
 */
export function onWarning(
  callback: (warning: EarlyWarning) => void
): () => void {
  warningEmitter.on('warning', callback);
  return () => warningEmitter.off('warning', callback);
}

/**
 * Get warning history for a person
 */
export async function getWarningHistory(
  personId: string,
  options: {
    days?: number;
    types?: WarningType[];
    includeResolved?: boolean;
  } = {}
): Promise<EarlyWarning[]> {
  const { days = 30, types, includeResolved = false } = options;

  // Simulate historical warnings
  const history: EarlyWarning[] = [];
  const numWarnings = 3 + Math.floor(Math.random() * 5);

  for (let i = 0; i < numWarnings; i++) {
    const daysAgo = Math.floor(Math.random() * days);
    const type = types?.[0] || 'workload_spike';
    const resolved = Math.random() > 0.5;

    if (!includeResolved && resolved) continue;

    history.push({
      id: `warning-hist-${i}`,
      personId,
      personName: 'Team Member',
      type: type as WarningType,
      severity: Math.random() > 0.7 ? 'critical' : 'warning',
      title: `${formatWarningType(type)} detected`,
      description: 'Historical warning',
      detectedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      signals: [],
      suggestedActions: [],
      status: resolved ? 'resolved' : 'active',
      resolvedAt: resolved ? new Date() : undefined,
    });
  }

  return history.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
}

// =============================================================================
// Warning Type Checks
// =============================================================================

async function checkWarningType(
  personId: string,
  personName: string,
  type: WarningType,
  thresholds: typeof THRESHOLDS.medium,
  lookbackDays: number
): Promise<EarlyWarning | null> {
  switch (type) {
    case 'workload_spike':
      return checkWorkloadSpike(personId, personName, thresholds.workload_spike);
    case 'sustained_overload':
      return checkSustainedOverload(personId, personName, thresholds.sustained_overload_days);
    case 'after_hours_pattern':
      return checkAfterHoursPattern(personId, personName, thresholds.after_hours_percent);
    case 'communication_surge':
      return checkCommunicationSurge(personId, personName, thresholds.communication_surge);
    case 'deadline_cluster':
      return checkDeadlineCluster(personId, personName, thresholds.deadline_cluster_count);
    case 'isolation_detected':
      return checkIsolation(personId, personName, thresholds.isolation_interaction_min);
    case 'declining_performance':
      return checkDecliningPerformance(personId, personName, thresholds.performance_decline);
    case 'missed_breaks':
      return checkMissedBreaks(personId, personName, thresholds.missed_breaks_days);
    case 'response_pressure':
      return checkResponsePressure(personId, personName, thresholds.response_pressure_minutes);
    case 'burnout_trajectory':
      return checkBurnoutTrajectory(personId, personName);
    default:
      return null;
  }
}

async function checkWorkloadSpike(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  // Simulate workload check
  const currentLoad = 80 + Math.random() * 50;
  const previousLoad = 70 + Math.random() * 20;

  if (currentLoad < threshold) return null;

  const increase = currentLoad - previousLoad;
  const severity = currentLoad > 130 ? 'critical' : 'warning';

  return {
    id: `warning-spike-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'workload_spike',
    severity,
    title: 'Workload Spike Detected',
    description: `Workload increased by ${Math.round(increase)}% to ${Math.round(currentLoad)}%`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Current Workload',
        currentValue: Math.round(currentLoad),
        threshold,
        trend: 'increasing',
        confidence: 85,
        description: `${Math.round(currentLoad)}% capacity utilized`,
      },
      {
        metric: 'Week-over-Week Change',
        currentValue: Math.round(increase),
        threshold: 15,
        trend: 'increasing',
        confidence: 80,
        description: `${Math.round(increase)}% increase from last week`,
      },
    ],
    suggestedActions: [
      {
        action: 'Review task priorities and identify items that can be deferred',
        priority: 'immediate',
        owner: 'individual',
        expectedImpact: 'Reduce immediate workload by 15-20%',
      },
      {
        action: 'Check-in with team member about current capacity',
        priority: 'soon',
        owner: 'manager',
        expectedImpact: 'Identify support needs and potential task redistribution',
      },
    ],
    status: 'active',
  };
}

async function checkSustainedOverload(
  personId: string,
  personName: string,
  thresholdDays: number
): Promise<EarlyWarning | null> {
  // Simulate sustained overload check
  const overloadDays = Math.floor(Math.random() * 14);
  const avgLoad = 90 + Math.random() * 20;

  if (overloadDays < thresholdDays) return null;

  return {
    id: `warning-sustained-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'sustained_overload',
    severity: overloadDays > 10 ? 'critical' : 'warning',
    title: 'Sustained Overload Pattern',
    description: `Consistently over capacity for ${overloadDays} consecutive days`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Overload Duration',
        currentValue: overloadDays,
        threshold: thresholdDays,
        trend: 'increasing',
        confidence: 90,
        description: `${overloadDays} days above 90% capacity`,
      },
      {
        metric: 'Average Load',
        currentValue: Math.round(avgLoad),
        threshold: 90,
        trend: 'stable',
        confidence: 85,
        description: `${Math.round(avgLoad)}% average during period`,
      },
    ],
    suggestedActions: [
      {
        action: 'Immediately redistribute 2-3 tasks to other team members',
        priority: 'immediate',
        owner: 'manager',
        expectedImpact: 'Bring workload to sustainable levels',
      },
      {
        action: 'Review upcoming deadlines and negotiate extensions where possible',
        priority: 'soon',
        owner: 'individual',
        expectedImpact: 'Create buffer for recovery',
      },
    ],
    status: 'active',
  };
}

async function checkAfterHoursPattern(
  personId: string,
  personName: string,
  thresholdPercent: number
): Promise<EarlyWarning | null> {
  const afterHoursPercent = Math.random() * 30;
  const weekendWork = Math.random() > 0.7;

  if (afterHoursPercent < thresholdPercent && !weekendWork) return null;

  return {
    id: `warning-afterhours-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'after_hours_pattern',
    severity: afterHoursPercent > 20 || weekendWork ? 'warning' : 'info',
    title: 'After-Hours Work Pattern',
    description: `${Math.round(afterHoursPercent)}% of work occurring outside business hours`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'After-Hours Work',
        currentValue: Math.round(afterHoursPercent),
        threshold: thresholdPercent,
        trend: 'increasing',
        confidence: 85,
        description: `${Math.round(afterHoursPercent)}% outside 9am-6pm`,
      },
    ],
    suggestedActions: [
      {
        action: 'Establish clear work boundaries and communicate them to team',
        priority: 'soon',
        owner: 'individual',
        expectedImpact: 'Improve work-life balance',
      },
    ],
    status: 'active',
  };
}

async function checkCommunicationSurge(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const dailyMessages = 50 + Math.floor(Math.random() * 200);
  const previousAvg = 80;

  if (dailyMessages < threshold) return null;

  return {
    id: `warning-comm-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'communication_surge',
    severity: dailyMessages > 200 ? 'critical' : 'warning',
    title: 'Communication Overload',
    description: `Receiving ${dailyMessages} messages/day, ${Math.round((dailyMessages/previousAvg - 1) * 100)}% above normal`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Daily Messages',
        currentValue: dailyMessages,
        threshold,
        trend: 'increasing',
        confidence: 90,
        description: `${dailyMessages} messages per day`,
      },
    ],
    suggestedActions: [
      {
        action: 'Implement dedicated focus blocks with notifications off',
        priority: 'immediate',
        owner: 'individual',
        expectedImpact: 'Reduce interruptions by 40%',
      },
    ],
    status: 'active',
  };
}

async function checkDeadlineCluster(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const deadlinesThisWeek = Math.floor(Math.random() * 8);

  if (deadlinesThisWeek < threshold) return null;

  return {
    id: `warning-deadline-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'deadline_cluster',
    severity: deadlinesThisWeek > 5 ? 'critical' : 'warning',
    title: 'Deadline Cluster Detected',
    description: `${deadlinesThisWeek} deadlines within the next 7 days`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Upcoming Deadlines',
        currentValue: deadlinesThisWeek,
        threshold,
        trend: 'stable',
        confidence: 95,
        description: `${deadlinesThisWeek} deadlines in next 7 days`,
      },
    ],
    suggestedActions: [
      {
        action: 'Prioritize tasks by business impact and negotiate deferrals',
        priority: 'immediate',
        owner: 'individual',
        expectedImpact: 'Reduce deadline pressure',
      },
    ],
    status: 'active',
  };
}

async function checkIsolation(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const weeklyInteractions = Math.floor(Math.random() * 10);

  if (weeklyInteractions >= threshold) return null;

  return {
    id: `warning-isolation-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'isolation_detected',
    severity: weeklyInteractions < 3 ? 'warning' : 'info',
    title: 'Social Isolation Pattern',
    description: `Only ${weeklyInteractions} team interactions this week`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Team Interactions',
        currentValue: weeklyInteractions,
        threshold,
        trend: 'decreasing',
        confidence: 75,
        description: `${weeklyInteractions} interactions vs ${threshold} expected`,
      },
    ],
    suggestedActions: [
      {
        action: 'Schedule informal catch-up with team members',
        priority: 'when_possible',
        owner: 'individual',
        expectedImpact: 'Increase sense of connection',
      },
    ],
    status: 'active',
  };
}

async function checkDecliningPerformance(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const performanceChange = -10 - Math.random() * 30;

  if (Math.abs(performanceChange) < threshold) return null;

  return {
    id: `warning-perf-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'declining_performance',
    severity: Math.abs(performanceChange) > 25 ? 'warning' : 'info',
    title: 'Performance Trend Concern',
    description: `Task completion rate down ${Math.round(Math.abs(performanceChange))}% from baseline`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Performance Change',
        currentValue: Math.round(performanceChange),
        threshold: -threshold,
        trend: 'decreasing',
        confidence: 70,
        description: `${Math.round(performanceChange)}% change in completion rate`,
      },
    ],
    suggestedActions: [
      {
        action: 'Review current task load for potential blockers',
        priority: 'soon',
        owner: 'manager',
        expectedImpact: 'Identify and remove obstacles',
      },
    ],
    status: 'active',
  };
}

async function checkMissedBreaks(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const missedBreakDays = Math.floor(Math.random() * 7);

  if (missedBreakDays < threshold) return null;

  return {
    id: `warning-breaks-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'missed_breaks',
    severity: missedBreakDays > 4 ? 'warning' : 'info',
    title: 'Insufficient Break Pattern',
    description: `Minimal breaks taken on ${missedBreakDays} of last 7 days`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Days with Missed Breaks',
        currentValue: missedBreakDays,
        threshold,
        trend: 'increasing',
        confidence: 80,
        description: `${missedBreakDays} days with insufficient breaks`,
      },
    ],
    suggestedActions: [
      {
        action: 'Set calendar reminders for regular breaks',
        priority: 'soon',
        owner: 'individual',
        expectedImpact: 'Improve focus and prevent fatigue',
      },
    ],
    status: 'active',
  };
}

async function checkResponsePressure(
  personId: string,
  personName: string,
  threshold: number
): Promise<EarlyWarning | null> {
  const avgResponseTime = 10 + Math.random() * 30;
  const expectedTime = 30;

  if (avgResponseTime >= threshold) return null;

  return {
    id: `warning-response-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'response_pressure',
    severity: avgResponseTime < 10 ? 'warning' : 'info',
    title: 'High Response Pressure',
    description: `Average response time of ${Math.round(avgResponseTime)} min suggests constant monitoring`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Avg Response Time',
        currentValue: Math.round(avgResponseTime),
        threshold,
        trend: 'decreasing',
        confidence: 75,
        description: `${Math.round(avgResponseTime)} min average response`,
      },
    ],
    suggestedActions: [
      {
        action: 'Set expectations for non-urgent response times',
        priority: 'soon',
        owner: 'team',
        expectedImpact: 'Reduce pressure to respond immediately',
      },
    ],
    status: 'active',
  };
}

async function checkBurnoutTrajectory(
  personId: string,
  personName: string
): Promise<EarlyWarning | null> {
  // Check if multiple warning signals present
  const riskFactors = Math.floor(Math.random() * 5);
  const trajectoryScore = 50 + Math.random() * 40;

  if (riskFactors < 3 && trajectoryScore < 70) return null;

  return {
    id: `warning-trajectory-${personId}-${Date.now()}`,
    personId,
    personName,
    type: 'burnout_trajectory',
    severity: trajectoryScore > 80 ? 'critical' : 'warning',
    title: 'Burnout Risk Trajectory',
    description: `${riskFactors} risk factors detected, trajectory score ${Math.round(trajectoryScore)}`,
    detectedAt: new Date(),
    signals: [
      {
        metric: 'Risk Factor Count',
        currentValue: riskFactors,
        threshold: 2,
        trend: 'increasing',
        confidence: 80,
        description: `${riskFactors} concurrent risk factors`,
      },
      {
        metric: 'Trajectory Score',
        currentValue: Math.round(trajectoryScore),
        threshold: 70,
        trend: 'increasing',
        confidence: 75,
        description: `${Math.round(trajectoryScore)}/100 burnout trajectory`,
      },
    ],
    suggestedActions: [
      {
        action: 'Schedule 1:1 to discuss workload and wellbeing',
        priority: 'immediate',
        owner: 'manager',
        expectedImpact: 'Early intervention before burnout',
      },
      {
        action: 'Consider temporary workload reduction or support',
        priority: 'immediate',
        owner: 'manager',
        expectedImpact: 'Break negative trajectory',
      },
    ],
    status: 'active',
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatWarningType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// Exports
// =============================================================================

export default {
  checkForWarnings,
  checkTeamWarnings,
  acknowledgeWarning,
  resolveWarning,
  onWarning,
  getWarningHistory,
};
