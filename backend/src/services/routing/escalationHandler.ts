/**
 * Escalation Handler Service
 * T043 - Create escalation handler
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { checkAvailability } from './availabilityChecker.js';
import { checkWorkloadCapacity } from './workloadBalancer.js';

// =============================================================================
// Types
// =============================================================================

export interface EscalationResult {
  handlerId: string;
  handlerName: string;
  handlerType: 'person' | 'team' | 'queue';
  escalationLevel: number;
  reason: string;
  originalHandlerId?: string;
}

export interface EscalationPath {
  levels: EscalationLevel[];
}

export interface EscalationLevel {
  level: number;
  type: 'manager' | 'role' | 'person' | 'team' | 'queue';
  targetId?: string;
  targetRole?: string;
  waitMinutes: number;
}

// =============================================================================
// Default Escalation Paths
// =============================================================================

const DEFAULT_ESCALATION_PATH: EscalationLevel[] = [
  { level: 1, type: 'manager', waitMinutes: 0 },
  { level: 2, type: 'role', targetRole: 'team_lead', waitMinutes: 30 },
  { level: 3, type: 'role', targetRole: 'department_head', waitMinutes: 60 },
  { level: 4, type: 'queue', targetId: 'general_queue', waitMinutes: 120 },
];

const URGENT_ESCALATION_PATH: EscalationLevel[] = [
  { level: 1, type: 'manager', waitMinutes: 0 },
  { level: 2, type: 'role', targetRole: 'team_lead', waitMinutes: 15 },
  { level: 3, type: 'queue', targetId: 'urgent_queue', waitMinutes: 30 },
];

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Handle escalation when primary handler is unavailable
 */
export async function handleEscalation(
  originalHandlerId: string,
  organizationId: string,
  options: {
    escalationPath?: EscalationLevel[];
    isUrgent?: boolean;
    startLevel?: number;
  } = {}
): Promise<EscalationResult> {
  const path = options.escalationPath ||
    (options.isUrgent ? URGENT_ESCALATION_PATH : DEFAULT_ESCALATION_PATH);

  const startLevel = options.startLevel || 1;

  logger.info({
    originalHandlerId,
    organizationId,
    startLevel,
    isUrgent: options.isUrgent,
  }, 'Starting escalation');

  for (const level of path.filter(l => l.level >= startLevel)) {
    const result = await tryEscalationLevel(
      level,
      originalHandlerId,
      organizationId
    );

    if (result) {
      logger.info({
        originalHandlerId,
        newHandlerId: result.handlerId,
        level: level.level,
      }, 'Escalation successful');

      return {
        ...result,
        escalationLevel: level.level,
        originalHandlerId,
      };
    }
  }

  // All escalation levels failed, return default queue
  logger.warn({
    originalHandlerId,
    organizationId,
  }, 'All escalation levels exhausted, using default queue');

  return {
    handlerId: 'default_queue',
    handlerName: 'Default Queue',
    handlerType: 'queue',
    escalationLevel: path.length + 1,
    reason: 'All escalation levels exhausted',
    originalHandlerId,
  };
}

/**
 * Try a specific escalation level
 */
async function tryEscalationLevel(
  level: EscalationLevel,
  originalHandlerId: string,
  organizationId: string
): Promise<Omit<EscalationResult, 'escalationLevel' | 'originalHandlerId'> | null> {
  switch (level.type) {
    case 'manager':
      return await tryManagerEscalation(originalHandlerId, organizationId);

    case 'role':
      return await tryRoleEscalation(level.targetRole!, organizationId);

    case 'person':
      return await tryPersonEscalation(level.targetId!, organizationId);

    case 'team':
      return {
        handlerId: level.targetId!,
        handlerName: `Team ${level.targetId}`,
        handlerType: 'team',
        reason: `Escalated to team at level ${level.level}`,
      };

    case 'queue':
      return {
        handlerId: level.targetId!,
        handlerName: level.targetId!.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        handlerType: 'queue',
        reason: `Escalated to queue at level ${level.level}`,
      };

    default:
      return null;
  }
}

/**
 * Try escalating to manager
 */
async function tryManagerEscalation(
  personId: string,
  organizationId: string
): Promise<Omit<EscalationResult, 'escalationLevel' | 'originalHandlerId'> | null> {
  // Get person's manager from graph (simplified - query graph in real implementation)
  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId },
  });

  if (!profile) return null;

  // Look for manager relationship (would be in Neo4j)
  const responseMetrics = profile.responseMetrics as Record<string, unknown>;
  const managerId = responseMetrics?.managerId as string | undefined;

  if (!managerId) {
    return null;
  }

  // Check manager availability
  const availability = await checkAvailability(managerId, organizationId);
  if (!availability.isAvailable) {
    return null;
  }

  const managerProfile = await prisma.expertiseProfile.findUnique({
    where: { personId: managerId },
  });

  return {
    handlerId: managerId,
    handlerName: managerProfile?.personName || 'Manager',
    handlerType: 'person',
    reason: 'Escalated to direct manager',
  };
}

/**
 * Try escalating to someone with a specific role
 */
async function tryRoleEscalation(
  role: string,
  organizationId: string
): Promise<Omit<EscalationResult, 'escalationLevel' | 'originalHandlerId'> | null> {
  // Find people with this role (simplified)
  const profiles = await prisma.expertiseProfile.findMany({
    where: {
      organizationId,
    },
    take: 10,
  });

  // Filter by role (would be in graph)
  for (const profile of profiles) {
    const availability = profile.availability as Record<string, unknown>;
    const personRole = availability?.role as string | undefined;

    if (personRole?.toLowerCase().includes(role.toLowerCase())) {
      const isAvailable = await checkAvailability(profile.personId, organizationId);
      const hasCapacity = await checkWorkloadCapacity(profile.personId, organizationId);

      if (isAvailable.isAvailable && hasCapacity.hasCapacity) {
        return {
          handlerId: profile.personId,
          handlerName: profile.personName,
          handlerType: 'person',
          reason: `Escalated to ${role.replace(/_/g, ' ')}`,
        };
      }
    }
  }

  return null;
}

/**
 * Try escalating to a specific person
 */
async function tryPersonEscalation(
  personId: string,
  organizationId: string
): Promise<Omit<EscalationResult, 'escalationLevel' | 'originalHandlerId'> | null> {
  const availability = await checkAvailability(personId, organizationId);

  if (!availability.isAvailable) {
    return null;
  }

  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId },
  });

  return {
    handlerId: personId,
    handlerName: profile?.personName || 'Unknown',
    handlerType: 'person',
    reason: 'Escalated to designated backup',
  };
}

/**
 * Get escalation path for a rule
 */
export async function getEscalationPath(
  ruleId: string
): Promise<EscalationPath | null> {
  const rule = await prisma.routingRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) return null;

  const handler = rule.handler as Record<string, unknown>;
  const escalationPath = handler?.escalationPath as EscalationLevel[] | undefined;

  if (escalationPath && escalationPath.length > 0) {
    return { levels: escalationPath };
  }

  return { levels: DEFAULT_ESCALATION_PATH };
}

/**
 * Record an escalation event
 */
export async function recordEscalation(
  decisionId: string,
  escalationResult: EscalationResult
): Promise<void> {
  await prisma.routingDecision.update({
    where: { id: decisionId },
    data: {
      wasEscalated: true,
      // Store escalation details in alternativeHandlers or metadata
      updatedAt: new Date(),
    },
  });

  logger.info({
    decisionId,
    escalationLevel: escalationResult.escalationLevel,
    newHandler: escalationResult.handlerId,
  }, 'Escalation recorded');
}

export default {
  handleEscalation,
  getEscalationPath,
  recordEscalation,
  DEFAULT_ESCALATION_PATH,
  URGENT_ESCALATION_PATH,
};
