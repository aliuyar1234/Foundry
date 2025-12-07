/**
 * Expertise Graph Service for OPERATE Tier
 * T029 - Create expertise graph query service
 */

import neo4j, { Driver, Session, Integer } from 'neo4j-driver';
import { logger } from '../../lib/logger.js';

// Get Neo4j driver from existing setup
let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
    });

    logger.info('Neo4j expertise graph driver initialized');
  }

  return driver;
}

// =============================================================================
// Expertise Profile Types
// =============================================================================

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: number; // 1-5
  confidence: number; // 0-1
  lastDemonstrated?: Date;
  evidenceCount: number;
}

export interface ExpertiseProfile {
  personId: string;
  personName: string;
  email?: string;
  department?: string;
  team?: string;
  skills: Skill[];
  domains: string[];
  languages: string[];
  processExpertise: ProcessExpertise[];
  responseMetrics: ResponseMetrics;
  availability: Availability;
  lastUpdated: Date;
}

export interface ProcessExpertise {
  processId: string;
  processName: string;
  proficiencyLevel: 'novice' | 'intermediate' | 'expert';
  instancesHandled: number;
  lastHandled?: Date;
}

export interface ResponseMetrics {
  avgResponseTimeMs: number;
  satisfactionScore: number; // 0-5
  volumeHandled: number;
  successRate: number; // 0-1
}

export interface Availability {
  schedule?: WeeklySchedule;
  timezone: string;
  currentWorkload: number; // 0-100
  isAvailable: boolean;
  nextAvailable?: Date;
}

export interface WeeklySchedule {
  monday?: TimeSlot[];
  tuesday?: TimeSlot[];
  wednesday?: TimeSlot[];
  thursday?: TimeSlot[];
  friday?: TimeSlot[];
  saturday?: TimeSlot[];
  sunday?: TimeSlot[];
}

export interface TimeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
}

// =============================================================================
// Query Expertise
// =============================================================================

/**
 * Find experts for a skill
 */
export async function findExpertsBySkill(
  organizationId: string,
  skillName: string,
  options: {
    minLevel?: number;
    minConfidence?: number;
    limit?: number;
    mustBeAvailable?: boolean;
  } = {}
): Promise<ExpertiseProfile[]> {
  const session = getDriver().session();
  const {
    minLevel = 3,
    minConfidence = 0.7,
    limit = 10,
    mustBeAvailable = false,
  } = options;

  try {
    const result = await session.run(`
      MATCH (p:Person {organizationId: $organizationId})-[r:HAS_EXPERTISE]->(s:Skill)
      WHERE s.name =~ $skillPattern
        AND r.level >= $minLevel
        AND r.confidence >= $minConfidence
        ${mustBeAvailable ? 'AND p.currentWorkload < 80' : ''}
      WITH p, r, s
      ORDER BY r.level DESC, r.confidence DESC
      LIMIT $limit
      OPTIONAL MATCH (p)-[pe:HANDLES_PROCESS]->(proc:Process)
      RETURN p, collect(DISTINCT {
        skill: s.name,
        level: r.level,
        confidence: r.confidence,
        lastDemonstrated: r.lastDemonstrated
      }) as skills,
      collect(DISTINCT {
        processId: proc.id,
        processName: proc.name,
        proficiency: pe.proficiency,
        instances: pe.instances
      }) as processes
    `, {
      organizationId,
      skillPattern: `(?i).*${skillName}.*`,
      minLevel: neo4j.int(minLevel),
      minConfidence,
      limit: neo4j.int(limit),
    });

    return result.records.map(record => mapToExpertiseProfile(record));
  } finally {
    await session.close();
  }
}

/**
 * Find experts for a domain
 */
export async function findExpertsByDomain(
  organizationId: string,
  domain: string,
  limit: number = 10
): Promise<ExpertiseProfile[]> {
  const session = getDriver().session();

  try {
    const result = await session.run(`
      MATCH (p:Person {organizationId: $organizationId})-[:EXPERT_IN]->(d:Domain)
      WHERE d.name =~ $domainPattern
      WITH p, d
      ORDER BY p.currentWorkload ASC
      LIMIT $limit
      OPTIONAL MATCH (p)-[r:HAS_EXPERTISE]->(s:Skill)
      RETURN p, collect(DISTINCT {
        skill: s.name,
        level: r.level,
        confidence: r.confidence
      }) as skills
    `, {
      organizationId,
      domainPattern: `(?i).*${domain}.*`,
      limit: neo4j.int(limit),
    });

    return result.records.map(record => mapToExpertiseProfile(record));
  } finally {
    await session.close();
  }
}

/**
 * Find experts for a process
 */
export async function findExpertsForProcess(
  organizationId: string,
  processId: string,
  options: {
    minProficiency?: 'novice' | 'intermediate' | 'expert';
    mustBeAvailable?: boolean;
    limit?: number;
  } = {}
): Promise<ExpertiseProfile[]> {
  const session = getDriver().session();
  const {
    minProficiency = 'intermediate',
    mustBeAvailable = false,
    limit = 10,
  } = options;

  const proficiencyLevels = {
    novice: 1,
    intermediate: 2,
    expert: 3,
  };

  try {
    const result = await session.run(`
      MATCH (p:Person {organizationId: $organizationId})-[r:HANDLES_PROCESS]->(proc:Process {id: $processId})
      WHERE r.proficiencyLevel >= $minProficiencyLevel
        ${mustBeAvailable ? 'AND p.currentWorkload < 80' : ''}
      WITH p, r, proc
      ORDER BY r.proficiencyLevel DESC, r.instances DESC
      LIMIT $limit
      OPTIONAL MATCH (p)-[se:HAS_EXPERTISE]->(s:Skill)
      RETURN p, proc, r,
        collect(DISTINCT {skill: s.name, level: se.level}) as skills
    `, {
      organizationId,
      processId,
      minProficiencyLevel: neo4j.int(proficiencyLevels[minProficiency]),
      limit: neo4j.int(limit),
    });

    return result.records.map(record => mapToExpertiseProfile(record));
  } finally {
    await session.close();
  }
}

/**
 * Get person's full expertise profile
 */
export async function getExpertiseProfile(
  organizationId: string,
  personId: string
): Promise<ExpertiseProfile | null> {
  const session = getDriver().session();

  try {
    const result = await session.run(`
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
      OPTIONAL MATCH (p)-[r:HAS_EXPERTISE]->(s:Skill)
      OPTIONAL MATCH (p)-[:EXPERT_IN]->(d:Domain)
      OPTIONAL MATCH (p)-[pe:HANDLES_PROCESS]->(proc:Process)
      RETURN p,
        collect(DISTINCT {
          skill: s.name,
          category: s.category,
          level: r.level,
          confidence: r.confidence,
          lastDemonstrated: r.lastDemonstrated,
          evidenceCount: r.evidenceCount
        }) as skills,
        collect(DISTINCT d.name) as domains,
        collect(DISTINCT {
          processId: proc.id,
          processName: proc.name,
          proficiency: pe.proficiency,
          instances: pe.instances,
          lastHandled: pe.lastHandled
        }) as processes
    `, {
      organizationId,
      personId,
    });

    if (result.records.length === 0) {
      return null;
    }

    return mapToExpertiseProfile(result.records[0]);
  } finally {
    await session.close();
  }
}

// =============================================================================
// Update Expertise
// =============================================================================

/**
 * Update or create expertise profile
 */
export async function updateExpertiseProfile(
  organizationId: string,
  personId: string,
  updates: {
    skills?: Array<{ name: string; category: string; level: number; confidence: number }>;
    domains?: string[];
    processExpertise?: Array<{ processId: string; proficiency: string; instances: number }>;
    currentWorkload?: number;
  }
): Promise<void> {
  const session = getDriver().session();

  try {
    await session.executeWrite(async (tx) => {
      // Update skills
      if (updates.skills) {
        for (const skill of updates.skills) {
          await tx.run(`
            MATCH (p:Person {organizationId: $organizationId, id: $personId})
            MERGE (s:Skill {name: $skillName})
            ON CREATE SET s.id = randomUUID(), s.category = $category
            MERGE (p)-[r:HAS_EXPERTISE]->(s)
            SET r.level = $level,
                r.confidence = $confidence,
                r.lastDemonstrated = datetime(),
                r.evidenceCount = coalesce(r.evidenceCount, 0) + 1
          `, {
            organizationId,
            personId,
            skillName: skill.name,
            category: skill.category,
            level: neo4j.int(skill.level),
            confidence: skill.confidence,
          });
        }
      }

      // Update domains
      if (updates.domains) {
        // First remove old domains
        await tx.run(`
          MATCH (p:Person {organizationId: $organizationId, id: $personId})-[r:EXPERT_IN]->(:Domain)
          DELETE r
        `, { organizationId, personId });

        // Add new domains
        for (const domain of updates.domains) {
          await tx.run(`
            MATCH (p:Person {organizationId: $organizationId, id: $personId})
            MERGE (d:Domain {name: $domain})
            ON CREATE SET d.id = randomUUID()
            MERGE (p)-[:EXPERT_IN]->(d)
          `, { organizationId, personId, domain });
        }
      }

      // Update process expertise
      if (updates.processExpertise) {
        for (const pe of updates.processExpertise) {
          await tx.run(`
            MATCH (p:Person {organizationId: $organizationId, id: $personId})
            MATCH (proc:Process {id: $processId})
            MERGE (p)-[r:HANDLES_PROCESS]->(proc)
            SET r.proficiency = $proficiency,
                r.proficiencyLevel = CASE $proficiency
                  WHEN 'expert' THEN 3
                  WHEN 'intermediate' THEN 2
                  ELSE 1
                END,
                r.instances = $instances,
                r.lastHandled = datetime()
          `, {
            organizationId,
            personId,
            processId: pe.processId,
            proficiency: pe.proficiency,
            instances: neo4j.int(pe.instances),
          });
        }
      }

      // Update workload
      if (updates.currentWorkload !== undefined) {
        await tx.run(`
          MATCH (p:Person {organizationId: $organizationId, id: $personId})
          SET p.currentWorkload = $workload,
              p.workloadUpdatedAt = datetime()
        `, {
          organizationId,
          personId,
          workload: updates.currentWorkload,
        });
      }
    });

    logger.debug({ personId }, 'Updated expertise profile');
  } finally {
    await session.close();
  }
}

/**
 * Increment skill evidence from activity
 */
export async function recordSkillEvidence(
  organizationId: string,
  personId: string,
  skillName: string,
  category: string,
  confidenceBoost: number = 0.05
): Promise<void> {
  const session = getDriver().session();

  try {
    await session.run(`
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
      MERGE (s:Skill {name: $skillName})
      ON CREATE SET s.id = randomUUID(), s.category = $category
      MERGE (p)-[r:HAS_EXPERTISE]->(s)
      ON CREATE SET r.level = 1, r.confidence = 0.5, r.evidenceCount = 0
      SET r.lastDemonstrated = datetime(),
          r.evidenceCount = r.evidenceCount + 1,
          r.confidence = CASE
            WHEN r.confidence + $boost > 1.0 THEN 1.0
            ELSE r.confidence + $boost
          END,
          r.level = CASE
            WHEN r.evidenceCount > 50 AND r.confidence > 0.9 THEN 5
            WHEN r.evidenceCount > 30 AND r.confidence > 0.8 THEN 4
            WHEN r.evidenceCount > 15 AND r.confidence > 0.7 THEN 3
            WHEN r.evidenceCount > 5 AND r.confidence > 0.6 THEN 2
            ELSE 1
          END
    `, {
      organizationId,
      personId,
      skillName,
      category,
      boost: confidenceBoost,
    });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapToExpertiseProfile(record: neo4j.Record): ExpertiseProfile {
  const person = record.get('p').properties;
  const skills = record.has('skills') ? record.get('skills') : [];
  const domains = record.has('domains') ? record.get('domains') : [];
  const processes = record.has('processes') ? record.get('processes') : [];

  return {
    personId: person.id,
    personName: person.name || person.displayName,
    email: person.email,
    department: person.department,
    team: person.team,
    skills: skills
      .filter((s: unknown) => s && typeof s === 'object' && (s as Record<string, unknown>).skill)
      .map((s: Record<string, unknown>) => ({
        id: `${person.id}-${s.skill}`,
        name: s.skill as string,
        category: (s.category as string) || 'general',
        level: toNumber(s.level) || 1,
        confidence: (s.confidence as number) || 0.5,
        lastDemonstrated: s.lastDemonstrated ? new Date(s.lastDemonstrated as string) : undefined,
        evidenceCount: toNumber(s.evidenceCount) || 0,
      })),
    domains: domains.filter((d: unknown) => d !== null),
    languages: person.languages || [],
    processExpertise: processes
      .filter((p: unknown) => p && typeof p === 'object' && (p as Record<string, unknown>).processId)
      .map((p: Record<string, unknown>) => ({
        processId: p.processId as string,
        processName: p.processName as string,
        proficiencyLevel: (p.proficiency as 'novice' | 'intermediate' | 'expert') || 'novice',
        instancesHandled: toNumber(p.instances) || 0,
        lastHandled: p.lastHandled ? new Date(p.lastHandled as string) : undefined,
      })),
    responseMetrics: {
      avgResponseTimeMs: toNumber(person.avgResponseTimeMs) || 0,
      satisfactionScore: (person.satisfactionScore as number) || 0,
      volumeHandled: toNumber(person.volumeHandled) || 0,
      successRate: (person.successRate as number) || 0,
    },
    availability: {
      timezone: (person.timezone as string) || 'Europe/Vienna',
      currentWorkload: (person.currentWorkload as number) || 0,
      isAvailable: (person.currentWorkload as number || 0) < 80,
      nextAvailable: person.nextAvailable ? new Date(person.nextAvailable as string) : undefined,
    },
    lastUpdated: person.workloadUpdatedAt ? new Date(person.workloadUpdatedAt as string) : new Date(),
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (neo4j.isInt(value)) return (value as Integer).toNumber();
  return 0;
}

// =============================================================================
// Cleanup
// =============================================================================

export async function closeExpertiseGraph(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    logger.info('Neo4j expertise graph driver closed');
  }
}

export default {
  getDriver,
  findExpertsBySkill,
  findExpertsByDomain,
  findExpertsForProcess,
  getExpertiseProfile,
  updateExpertiseProfile,
  recordSkillEvidence,
  closeExpertiseGraph,
};
