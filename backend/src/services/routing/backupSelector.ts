/**
 * Backup Selector Service
 * T045 - Create backup handler selector
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { checkAvailability } from './availabilityChecker.js';
import { checkWorkloadCapacity } from './workloadBalancer.js';
import { findExpertsBySkill, getExpertiseProfile } from '../operate/expertiseGraph.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface BackupResult {
  personId: string;
  personName: string;
  workloadScore: number;
  availabilityScore: number;
  expertiseScore: number;
  reason: string;
}

export interface BackupOptions {
  /** Require handler to have capacity */
  requireCapacity?: boolean;
  /** Require similar skills */
  requireSimilarSkills?: boolean;
  /** Prefer same team */
  preferSameTeam?: boolean;
  /** Exclude these person IDs */
  excludeIds?: string[];
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Select a backup handler for an unavailable primary handler
 */
export async function selectBackup(
  primaryHandlerId: string,
  organizationId: string,
  options: BackupOptions = {}
): Promise<BackupResult | null> {
  logger.debug({ primaryHandlerId, organizationId, options }, 'Selecting backup handler');

  // Get primary handler's profile
  const primaryProfile = await getExpertiseProfile(organizationId, primaryHandlerId);

  // Strategy 1: Check designated backup
  const designatedBackup = await findDesignatedBackup(primaryHandlerId, organizationId, options);
  if (designatedBackup) {
    logger.debug({ backupId: designatedBackup.personId }, 'Found designated backup');
    return designatedBackup;
  }

  // Strategy 2: Find team member with similar skills
  if (primaryProfile) {
    const teamBackup = await findTeamBackup(primaryProfile, organizationId, options);
    if (teamBackup) {
      logger.debug({ backupId: teamBackup.personId }, 'Found team backup');
      return teamBackup;
    }
  }

  // Strategy 3: Find anyone with similar skills
  if (primaryProfile && primaryProfile.skills.length > 0) {
    const skillBackup = await findSkillBackup(primaryProfile, organizationId, options);
    if (skillBackup) {
      logger.debug({ backupId: skillBackup.personId }, 'Found skill-based backup');
      return skillBackup;
    }
  }

  // Strategy 4: Find lowest workload person in organization
  const lowestWorkloadBackup = await findLowestWorkloadBackup(organizationId, {
    ...options,
    excludeIds: [...(options.excludeIds || []), primaryHandlerId],
  });

  if (lowestWorkloadBackup) {
    logger.debug({ backupId: lowestWorkloadBackup.personId }, 'Found lowest workload backup');
    return lowestWorkloadBackup;
  }

  logger.warn({ primaryHandlerId }, 'No backup found');
  return null;
}

/**
 * Find designated backup for a person
 */
async function findDesignatedBackup(
  primaryHandlerId: string,
  organizationId: string,
  options: BackupOptions
): Promise<BackupResult | null> {
  // Get primary handler's profile
  const profile = await prisma.expertiseProfile.findUnique({
    where: { personId: primaryHandlerId },
  });

  if (!profile) return null;

  const availability = profile.availability as Record<string, unknown>;
  const designatedBackupId = availability?.backupPersonId as string | undefined;

  if (!designatedBackupId || options.excludeIds?.includes(designatedBackupId)) {
    return null;
  }

  // Check backup availability
  const backupAvailability = await checkAvailability(designatedBackupId, organizationId);
  if (!backupAvailability.isAvailable) {
    return null;
  }

  // Check backup capacity if required
  if (options.requireCapacity) {
    const capacity = await checkWorkloadCapacity(designatedBackupId, organizationId);
    if (!capacity.hasCapacity) {
      return null;
    }
  }

  const backupProfile = await prisma.expertiseProfile.findUnique({
    where: { personId: designatedBackupId },
  });

  return {
    personId: designatedBackupId,
    personName: backupProfile?.personName || 'Unknown',
    workloadScore: 0.7,
    availabilityScore: backupAvailability.score,
    expertiseScore: 0.8, // Designated backups assumed to be competent
    reason: 'Designated backup for primary handler',
  };
}

/**
 * Find backup from same team
 */
async function findTeamBackup(
  primaryProfile: Awaited<ReturnType<typeof getExpertiseProfile>>,
  organizationId: string,
  options: BackupOptions
): Promise<BackupResult | null> {
  if (!primaryProfile) return null;

  const team = primaryProfile.team;
  if (!team) return null;

  // Get team members
  const teamMembers = await prisma.expertiseProfile.findMany({
    where: {
      organizationId,
      personId: {
        not: primaryProfile.personId,
        notIn: options.excludeIds || [],
      },
    },
    take: 20,
  });

  // Filter to same team
  const sameTeam = teamMembers.filter(m => {
    const avail = m.availability as Record<string, unknown>;
    return avail?.team === team;
  });

  for (const member of sameTeam) {
    const availability = await checkAvailability(member.personId, organizationId);
    if (!availability.isAvailable) continue;

    if (options.requireCapacity) {
      const capacity = await checkWorkloadCapacity(member.personId, organizationId);
      if (!capacity.hasCapacity) continue;
    }

    return {
      personId: member.personId,
      personName: member.personName,
      workloadScore: 0.6,
      availabilityScore: availability.score,
      expertiseScore: 0.7,
      reason: 'Team member with availability',
    };
  }

  return null;
}

/**
 * Find backup with similar skills
 */
async function findSkillBackup(
  primaryProfile: Awaited<ReturnType<typeof getExpertiseProfile>>,
  organizationId: string,
  options: BackupOptions
): Promise<BackupResult | null> {
  if (!primaryProfile || primaryProfile.skills.length === 0) return null;

  // Get top skills
  const topSkills = primaryProfile.skills
    .sort((a, b) => b.level - a.level)
    .slice(0, 3);

  for (const skill of topSkills) {
    const experts = await findExpertsBySkill(organizationId, skill.name, {
      minLevel: Math.max(1, skill.level - 1),
      mustBeAvailable: true,
      limit: 5,
    });

    for (const expert of experts) {
      if (expert.personId === primaryProfile.personId) continue;
      if (options.excludeIds?.includes(expert.personId)) continue;

      const availability = await checkAvailability(expert.personId, organizationId);
      if (!availability.isAvailable) continue;

      if (options.requireCapacity) {
        const capacity = await checkWorkloadCapacity(expert.personId, organizationId);
        if (!capacity.hasCapacity) continue;
      }

      // Calculate expertise overlap
      const expertSkills = expert.skills.map(s => s.name.toLowerCase());
      const primarySkills = primaryProfile.skills.map(s => s.name.toLowerCase());
      const overlap = primarySkills.filter(s =>
        expertSkills.some(es => es.includes(s) || s.includes(es))
      ).length;
      const expertiseScore = Math.min(1, overlap / primarySkills.length + 0.3);

      return {
        personId: expert.personId,
        personName: expert.personName,
        workloadScore: expert.availability.currentWorkload
          ? 1 - (expert.availability.currentWorkload / 100)
          : 0.5,
        availabilityScore: availability.score,
        expertiseScore,
        reason: `Expert in ${skill.name} (level ${expert.skills.find(s => s.name === skill.name)?.level || 'N/A'})`,
      };
    }
  }

  return null;
}

/**
 * Find person with lowest workload
 */
async function findLowestWorkloadBackup(
  organizationId: string,
  options: BackupOptions
): Promise<BackupResult | null> {
  const profiles = await prisma.expertiseProfile.findMany({
    where: {
      organizationId,
      personId: { notIn: options.excludeIds || [] },
    },
    take: 50,
  });

  interface Candidate {
    profile: typeof profiles[0];
    workload: number;
    availabilityScore: number;
  }

  const candidates: Candidate[] = [];

  for (const profile of profiles) {
    const availability = await checkAvailability(profile.personId, organizationId);
    if (!availability.isAvailable) continue;

    const capacity = await checkWorkloadCapacity(profile.personId, organizationId);
    if (options.requireCapacity && !capacity.hasCapacity) continue;

    candidates.push({
      profile,
      workload: capacity.currentWorkload,
      availabilityScore: availability.score,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by workload ascending
  candidates.sort((a, b) => a.workload - b.workload);
  const best = candidates[0];

  return {
    personId: best.profile.personId,
    personName: best.profile.personName,
    workloadScore: 1 - (best.workload / 100),
    availabilityScore: best.availabilityScore,
    expertiseScore: 0.5, // Unknown expertise match
    reason: `Lowest workload in organization (${best.workload}%)`,
  };
}

/**
 * Get backup candidates ranked by suitability
 */
export async function getBackupCandidates(
  primaryHandlerId: string,
  organizationId: string,
  limit: number = 5
): Promise<BackupResult[]> {
  const candidates: BackupResult[] = [];

  // Get primary profile
  const primaryProfile = await getExpertiseProfile(organizationId, primaryHandlerId);

  // Collect all possible backups
  const designated = await findDesignatedBackup(primaryHandlerId, organizationId, {});
  if (designated) candidates.push(designated);

  if (primaryProfile) {
    const teamBackup = await findTeamBackup(primaryProfile, organizationId, {
      excludeIds: candidates.map(c => c.personId),
    });
    if (teamBackup) candidates.push(teamBackup);

    const skillBackups = await findMultipleSkillBackups(primaryProfile, organizationId, {
      excludeIds: [...candidates.map(c => c.personId), primaryHandlerId],
      limit: limit - candidates.length,
    });
    candidates.push(...skillBackups);
  }

  // Sort by combined score
  return candidates
    .sort((a, b) => {
      const scoreA = a.expertiseScore * 0.4 + a.availabilityScore * 0.3 + a.workloadScore * 0.3;
      const scoreB = b.expertiseScore * 0.4 + b.availabilityScore * 0.3 + b.workloadScore * 0.3;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

/**
 * Find multiple skill-based backups
 */
async function findMultipleSkillBackups(
  primaryProfile: Awaited<ReturnType<typeof getExpertiseProfile>>,
  organizationId: string,
  options: { excludeIds?: string[]; limit: number }
): Promise<BackupResult[]> {
  const results: BackupResult[] = [];
  const excludeIds = new Set(options.excludeIds || []);

  if (!primaryProfile || primaryProfile.skills.length === 0) {
    return results;
  }

  for (const skill of primaryProfile.skills.slice(0, 3)) {
    const experts = await findExpertsBySkill(organizationId, skill.name, {
      minLevel: 2,
      mustBeAvailable: true,
      limit: 3,
    });

    for (const expert of experts) {
      if (excludeIds.has(expert.personId)) continue;
      if (results.length >= options.limit) break;

      excludeIds.add(expert.personId);
      results.push({
        personId: expert.personId,
        personName: expert.personName,
        workloadScore: expert.availability.currentWorkload
          ? 1 - (expert.availability.currentWorkload / 100)
          : 0.5,
        availabilityScore: expert.availability.isAvailable ? 1 : 0,
        expertiseScore: 0.7,
        reason: `Expert in ${skill.name}`,
      });
    }
  }

  return results;
}

export default {
  selectBackup,
  getBackupCandidates,
};
