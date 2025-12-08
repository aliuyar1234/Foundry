/**
 * ExpertiseProfile Node Model
 * T037 - Create ExpertiseProfile graph operations
 *
 * Handles ExpertiseProfile node operations in Neo4j knowledge graph
 */

import neo4j, { Integer } from 'neo4j-driver';
import { runQuery, runWriteTransaction } from '../connection.js';

// =============================================================================
// Types
// =============================================================================

export interface ExpertiseProfileNode {
  id: string;
  personId: string;
  personName: string;
  email?: string;
  department?: string;
  team?: string;
  skills: SkillEntry[];
  domains: string[];
  languages: string[];
  certifications: Certification[];
  processExpertise: ProcessExpertiseEntry[];
  responseMetrics: ResponseMetrics;
  availability: AvailabilityInfo;
  lastUpdatedFrom: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillEntry {
  name: string;
  category: string;
  level: number; // 1-5
  confidence: number; // 0-1
  lastDemonstrated?: Date;
  evidenceCount: number;
}

export interface Certification {
  name: string;
  issuer: string;
  issuedAt?: Date;
  expiresAt?: Date;
  verificationUrl?: string;
}

export interface ProcessExpertiseEntry {
  processId: string;
  processName?: string;
  proficiencyLevel: 'novice' | 'intermediate' | 'expert';
  instancesHandled: number;
  lastHandled?: Date;
}

export interface ResponseMetrics {
  avgResponseTimeMs: number;
  satisfactionScore: number;
  volumeHandled: number;
  successRate: number;
}

export interface AvailabilityInfo {
  timezone: string;
  currentWorkload: number;
  maxWorkload: number;
  isAvailable: boolean;
  nextAvailable?: Date;
  schedule?: WeeklySchedule;
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
  start: string;
  end: string;
}

export interface CreateExpertiseProfileInput {
  personId: string;
  personName: string;
  email?: string;
  department?: string;
  team?: string;
  organizationId: string;
  skills?: SkillEntry[];
  domains?: string[];
  languages?: string[];
  timezone?: string;
}

export interface UpdateExpertiseProfileInput {
  personName?: string;
  department?: string;
  team?: string;
  skills?: SkillEntry[];
  domains?: string[];
  languages?: string[];
  certifications?: Certification[];
  processExpertise?: ProcessExpertiseEntry[];
  responseMetrics?: Partial<ResponseMetrics>;
  availability?: Partial<AvailabilityInfo>;
}

// =============================================================================
// Create & Update Operations
// =============================================================================

/**
 * Create or update an ExpertiseProfile node
 */
export async function upsertExpertiseProfile(
  input: CreateExpertiseProfileInput
): Promise<ExpertiseProfileNode> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MERGE (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      ON CREATE SET
        ep.id = randomUUID(),
        ep.personName = $personName,
        ep.email = $email,
        ep.department = $department,
        ep.team = $team,
        ep.skills = $skills,
        ep.domains = $domains,
        ep.languages = $languages,
        ep.certifications = [],
        ep.processExpertise = [],
        ep.responseMetrics = $defaultMetrics,
        ep.availability = $defaultAvailability,
        ep.lastUpdatedFrom = 'system',
        ep.createdAt = datetime(),
        ep.updatedAt = datetime()
      ON MATCH SET
        ep.personName = COALESCE($personName, ep.personName),
        ep.email = COALESCE($email, ep.email),
        ep.department = COALESCE($department, ep.department),
        ep.team = COALESCE($team, ep.team),
        ep.updatedAt = datetime()

      // Link to Person node if exists
      WITH ep
      OPTIONAL MATCH (p:Person {organizationId: $organizationId, id: $personId})
      FOREACH (ignore IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
        MERGE (p)-[:HAS_PROFILE]->(ep)
      )

      RETURN ep
    `;

    const defaultMetrics = JSON.stringify({
      avgResponseTimeMs: 0,
      satisfactionScore: 0,
      volumeHandled: 0,
      successRate: 0,
    });

    const defaultAvailability = JSON.stringify({
      timezone: input.timezone || 'Europe/Vienna',
      currentWorkload: 0,
      maxWorkload: 100,
      isAvailable: true,
    });

    const result = await tx.run(query, {
      organizationId: input.organizationId,
      personId: input.personId,
      personName: input.personName,
      email: input.email?.toLowerCase() || null,
      department: input.department || null,
      team: input.team || null,
      skills: JSON.stringify(input.skills || []),
      domains: input.domains || [],
      languages: input.languages || [],
      defaultMetrics,
      defaultAvailability,
    });

    return result.records[0]?.get('ep').properties;
  });

  return mapToExpertiseProfileNode(result);
}

/**
 * Update an existing ExpertiseProfile
 */
export async function updateExpertiseProfile(
  organizationId: string,
  personId: string,
  updates: UpdateExpertiseProfileInput
): Promise<ExpertiseProfileNode | null> {
  const result = await runWriteTransaction(async (tx) => {
    // Build dynamic SET clause
    const setClauses: string[] = ['ep.updatedAt = datetime()'];
    const params: Record<string, unknown> = { organizationId, personId };

    if (updates.personName !== undefined) {
      setClauses.push('ep.personName = $personName');
      params.personName = updates.personName;
    }
    if (updates.department !== undefined) {
      setClauses.push('ep.department = $department');
      params.department = updates.department;
    }
    if (updates.team !== undefined) {
      setClauses.push('ep.team = $team');
      params.team = updates.team;
    }
    if (updates.skills !== undefined) {
      setClauses.push('ep.skills = $skills');
      params.skills = JSON.stringify(updates.skills);
    }
    if (updates.domains !== undefined) {
      setClauses.push('ep.domains = $domains');
      params.domains = updates.domains;
    }
    if (updates.languages !== undefined) {
      setClauses.push('ep.languages = $languages');
      params.languages = updates.languages;
    }
    if (updates.certifications !== undefined) {
      setClauses.push('ep.certifications = $certifications');
      params.certifications = JSON.stringify(updates.certifications);
    }
    if (updates.processExpertise !== undefined) {
      setClauses.push('ep.processExpertise = $processExpertise');
      params.processExpertise = JSON.stringify(updates.processExpertise);
    }
    if (updates.responseMetrics !== undefined) {
      setClauses.push('ep.responseMetrics = $responseMetrics');
      params.responseMetrics = JSON.stringify(updates.responseMetrics);
    }
    if (updates.availability !== undefined) {
      setClauses.push('ep.availability = $availability');
      params.availability = JSON.stringify(updates.availability);
    }

    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      SET ${setClauses.join(', ')}
      RETURN ep
    `;

    const result = await tx.run(query, params);
    return result.records[0]?.get('ep')?.properties || null;
  });

  return result ? mapToExpertiseProfileNode(result) : null;
}

/**
 * Bulk upsert expertise profiles
 */
export async function bulkUpsertExpertiseProfiles(
  inputs: CreateExpertiseProfileInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $profiles as profile
      MERGE (ep:ExpertiseProfile {organizationId: profile.organizationId, personId: profile.personId})
      ON CREATE SET
        ep.id = randomUUID(),
        ep.personName = profile.personName,
        ep.email = profile.email,
        ep.department = profile.department,
        ep.team = profile.team,
        ep.skills = profile.skills,
        ep.domains = profile.domains,
        ep.languages = profile.languages,
        ep.certifications = [],
        ep.processExpertise = [],
        ep.responseMetrics = profile.defaultMetrics,
        ep.availability = profile.defaultAvailability,
        ep.lastUpdatedFrom = 'bulk_import',
        ep.createdAt = datetime(),
        ep.updatedAt = datetime()
      ON MATCH SET
        ep.personName = COALESCE(profile.personName, ep.personName),
        ep.updatedAt = datetime()
      RETURN count(ep) as count
    `;

    const profiles = inputs.map((input) => ({
      organizationId: input.organizationId,
      personId: input.personId,
      personName: input.personName,
      email: input.email?.toLowerCase() || null,
      department: input.department || null,
      team: input.team || null,
      skills: JSON.stringify(input.skills || []),
      domains: input.domains || [],
      languages: input.languages || [],
      defaultMetrics: JSON.stringify({
        avgResponseTimeMs: 0,
        satisfactionScore: 0,
        volumeHandled: 0,
        successRate: 0,
      }),
      defaultAvailability: JSON.stringify({
        timezone: input.timezone || 'Europe/Vienna',
        currentWorkload: 0,
        maxWorkload: 100,
        isAvailable: true,
      }),
    }));

    const result = await tx.run(query, { profiles });
    return toNumber(result.records[0]?.get('count'));
  });

  return result;
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Find expertise profile by personId
 */
export async function findExpertiseProfileByPersonId(
  organizationId: string,
  personId: string
): Promise<ExpertiseProfileNode | null> {
  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
    RETURN ep
    `,
    { organizationId, personId }
  );

  if (results.length === 0) return null;
  return mapToExpertiseProfileNode(results[0].ep.properties);
}

/**
 * Find expertise profiles by organization
 */
export async function findExpertiseProfilesByOrganization(
  organizationId: string,
  options?: { limit?: number; offset?: number; department?: string }
): Promise<ExpertiseProfileNode[]> {
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  let whereClause = '';
  const params: Record<string, unknown> = { organizationId, limit, offset };

  if (options?.department) {
    whereClause = 'AND ep.department = $department';
    params.department = options.department;
  }

  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    ${whereClause}
    RETURN ep
    ORDER BY ep.personName
    SKIP $offset LIMIT $limit
    `,
    params
  );

  return results.map((r) => mapToExpertiseProfileNode(r.ep.properties));
}

/**
 * Find expertise profiles with specific skill
 */
export async function findExpertiseProfilesBySkill(
  organizationId: string,
  skillName: string,
  options?: { minLevel?: number; minConfidence?: number; limit?: number }
): Promise<ExpertiseProfileNode[]> {
  const minLevel = options?.minLevel || 1;
  const minConfidence = options?.minConfidence || 0;
  const limit = options?.limit || 50;

  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    WHERE ANY(skill IN apoc.convert.fromJsonList(ep.skills)
      WHERE skill.name =~ $skillPattern
        AND skill.level >= $minLevel
        AND skill.confidence >= $minConfidence)
    RETURN ep
    ORDER BY ep.personName
    LIMIT $limit
    `,
    {
      organizationId,
      skillPattern: `(?i).*${skillName}.*`,
      minLevel,
      minConfidence,
      limit,
    }
  );

  return results.map((r) => mapToExpertiseProfileNode(r.ep.properties));
}

/**
 * Find expertise profiles by domain
 */
export async function findExpertiseProfilesByDomain(
  organizationId: string,
  domain: string,
  limit: number = 50
): Promise<ExpertiseProfileNode[]> {
  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    WHERE ANY(d IN ep.domains WHERE d =~ $domainPattern)
    RETURN ep
    ORDER BY ep.personName
    LIMIT $limit
    `,
    {
      organizationId,
      domainPattern: `(?i).*${domain}.*`,
      limit,
    }
  );

  return results.map((r) => mapToExpertiseProfileNode(r.ep.properties));
}

/**
 * Find available experts with capacity
 */
export async function findAvailableExperts(
  organizationId: string,
  options?: { maxWorkload?: number; minSkillLevel?: number; skills?: string[] }
): Promise<ExpertiseProfileNode[]> {
  const maxWorkload = options?.maxWorkload || 80;

  let skillFilter = '';
  const params: Record<string, unknown> = { organizationId, maxWorkload };

  if (options?.skills && options.skills.length > 0) {
    skillFilter = `
      AND ANY(skill IN apoc.convert.fromJsonList(ep.skills)
        WHERE ANY(s IN $skills WHERE skill.name =~ ('(?i).*' + s + '.*'))
          AND skill.level >= $minSkillLevel)
    `;
    params.skills = options.skills;
    params.minSkillLevel = options.minSkillLevel || 2;
  }

  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    WHERE apoc.convert.fromJsonMap(ep.availability).currentWorkload <= $maxWorkload
      AND apoc.convert.fromJsonMap(ep.availability).isAvailable = true
      ${skillFilter}
    RETURN ep
    ORDER BY apoc.convert.fromJsonMap(ep.availability).currentWorkload ASC
    LIMIT 50
    `,
    params
  );

  return results.map((r) => mapToExpertiseProfileNode(r.ep.properties));
}

/**
 * Search expertise profiles by name or email
 */
export async function searchExpertiseProfiles(
  organizationId: string,
  searchTerm: string,
  limit: number = 20
): Promise<ExpertiseProfileNode[]> {
  const results = await runQuery<{ ep: { properties: Record<string, unknown> } }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    WHERE ep.personName =~ $searchPattern OR ep.email =~ $searchPattern
    RETURN ep
    ORDER BY ep.personName
    LIMIT $limit
    `,
    {
      organizationId,
      searchPattern: `(?i).*${searchTerm}.*`,
      limit,
    }
  );

  return results.map((r) => mapToExpertiseProfileNode(r.ep.properties));
}

// =============================================================================
// Skill Operations
// =============================================================================

/**
 * Add or update a skill for a person
 */
export async function addSkill(
  organizationId: string,
  personId: string,
  skill: SkillEntry
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      SET ep.skills = apoc.convert.toJson(
        [s IN apoc.convert.fromJsonList(ep.skills) WHERE s.name <> $skillName] + [$skill]
      ),
      ep.updatedAt = datetime()
    `;

    await tx.run(query, {
      organizationId,
      personId,
      skillName: skill.name,
      skill: JSON.stringify(skill),
    });
  });
}

/**
 * Remove a skill from a person
 */
export async function removeSkill(
  organizationId: string,
  personId: string,
  skillName: string
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      SET ep.skills = apoc.convert.toJson(
        [s IN apoc.convert.fromJsonList(ep.skills) WHERE s.name <> $skillName]
      ),
      ep.updatedAt = datetime()
    `;

    await tx.run(query, { organizationId, personId, skillName });
  });
}

/**
 * Update skill evidence (increment evidence count, update confidence)
 */
export async function recordSkillEvidence(
  organizationId: string,
  personId: string,
  skillName: string,
  confidenceBoost: number = 0.05
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    // First check if profile exists, create if not
    await tx.run(
      `
      MERGE (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      ON CREATE SET
        ep.id = randomUUID(),
        ep.skills = '[]',
        ep.domains = [],
        ep.languages = [],
        ep.certifications = [],
        ep.processExpertise = [],
        ep.responseMetrics = '{}',
        ep.availability = '{"currentWorkload":0,"maxWorkload":100,"isAvailable":true}',
        ep.lastUpdatedFrom = 'evidence',
        ep.createdAt = datetime(),
        ep.updatedAt = datetime()
      `,
      { organizationId, personId }
    );

    // Update the skill with evidence
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      WITH ep, apoc.convert.fromJsonList(ep.skills) as skills
      WITH ep, skills,
           [s IN skills WHERE s.name = $skillName] as existingSkill,
           [s IN skills WHERE s.name <> $skillName] as otherSkills
      SET ep.skills = apoc.convert.toJson(
        otherSkills + [
          CASE WHEN size(existingSkill) > 0 THEN {
            name: $skillName,
            category: existingSkill[0].category,
            level: CASE
              WHEN existingSkill[0].evidenceCount + 1 > 50 THEN 5
              WHEN existingSkill[0].evidenceCount + 1 > 30 THEN 4
              WHEN existingSkill[0].evidenceCount + 1 > 15 THEN 3
              WHEN existingSkill[0].evidenceCount + 1 > 5 THEN 2
              ELSE 1
            END,
            confidence: CASE
              WHEN existingSkill[0].confidence + $boost > 1.0 THEN 1.0
              ELSE existingSkill[0].confidence + $boost
            END,
            lastDemonstrated: datetime(),
            evidenceCount: existingSkill[0].evidenceCount + 1
          } ELSE {
            name: $skillName,
            category: 'general',
            level: 1,
            confidence: 0.5 + $boost,
            lastDemonstrated: datetime(),
            evidenceCount: 1
          } END
        ]
      ),
      ep.updatedAt = datetime()
    `;

    await tx.run(query, {
      organizationId,
      personId,
      skillName,
      boost: confidenceBoost,
    });
  });
}

// =============================================================================
// Availability Operations
// =============================================================================

/**
 * Update workload for a person
 */
export async function updateWorkload(
  organizationId: string,
  personId: string,
  workload: number
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      SET ep.availability = apoc.convert.toJson(
        apoc.map.setKey(
          apoc.map.setKey(
            apoc.convert.fromJsonMap(ep.availability),
            'currentWorkload',
            $workload
          ),
          'isAvailable',
          $workload < 80
        )
      ),
      ep.updatedAt = datetime()
    `;

    await tx.run(query, { organizationId, personId, workload });
  });
}

/**
 * Update availability status
 */
export async function updateAvailability(
  organizationId: string,
  personId: string,
  isAvailable: boolean,
  nextAvailable?: Date
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      SET ep.availability = apoc.convert.toJson(
        apoc.map.setKey(
          apoc.map.setKey(
            apoc.convert.fromJsonMap(ep.availability),
            'isAvailable',
            $isAvailable
          ),
          'nextAvailable',
          $nextAvailable
        )
      ),
      ep.updatedAt = datetime()
    `;

    await tx.run(query, {
      organizationId,
      personId,
      isAvailable,
      nextAvailable: nextAvailable?.toISOString() || null,
    });
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Delete an expertise profile
 */
export async function deleteExpertiseProfile(
  organizationId: string,
  personId: string
): Promise<boolean> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (ep:ExpertiseProfile {organizationId: $organizationId, personId: $personId})
      DETACH DELETE ep
      RETURN count(ep) as deleted
    `;

    const result = await tx.run(query, { organizationId, personId });
    return toNumber(result.records[0]?.get('deleted'));
  });

  return result > 0;
}

/**
 * Count expertise profiles in organization
 */
export async function countExpertiseProfiles(organizationId: string): Promise<number> {
  const results = await runQuery<{ count: { low: number } | Integer }>(
    `
    MATCH (ep:ExpertiseProfile {organizationId: $organizationId})
    RETURN count(ep) as count
    `,
    { organizationId }
  );

  return toNumber(results[0]?.count);
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapToExpertiseProfileNode(
  properties: Record<string, unknown>
): ExpertiseProfileNode {
  const parseJson = <T>(value: unknown, defaultValue: T): T => {
    if (!value) return defaultValue;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return defaultValue;
      }
    }
    return value as T;
  };

  return {
    id: properties.id as string,
    personId: properties.personId as string,
    personName: properties.personName as string,
    email: properties.email as string | undefined,
    department: properties.department as string | undefined,
    team: properties.team as string | undefined,
    skills: parseJson<SkillEntry[]>(properties.skills, []),
    domains: (properties.domains as string[]) || [],
    languages: (properties.languages as string[]) || [],
    certifications: parseJson<Certification[]>(properties.certifications, []),
    processExpertise: parseJson<ProcessExpertiseEntry[]>(properties.processExpertise, []),
    responseMetrics: parseJson<ResponseMetrics>(properties.responseMetrics, {
      avgResponseTimeMs: 0,
      satisfactionScore: 0,
      volumeHandled: 0,
      successRate: 0,
    }),
    availability: parseJson<AvailabilityInfo>(properties.availability, {
      timezone: 'Europe/Vienna',
      currentWorkload: 0,
      maxWorkload: 100,
      isAvailable: true,
    }),
    lastUpdatedFrom: (properties.lastUpdatedFrom as string) || 'unknown',
    organizationId: properties.organizationId as string,
    createdAt: new Date(properties.createdAt as string),
    updatedAt: new Date(properties.updatedAt as string),
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'low' in value) {
    return (value as { low: number }).low;
  }
  if (neo4j.isInt(value)) return (value as Integer).toNumber();
  return 0;
}

export default {
  upsertExpertiseProfile,
  updateExpertiseProfile,
  bulkUpsertExpertiseProfiles,
  findExpertiseProfileByPersonId,
  findExpertiseProfilesByOrganization,
  findExpertiseProfilesBySkill,
  findExpertiseProfilesByDomain,
  findAvailableExperts,
  searchExpertiseProfiles,
  addSkill,
  removeSkill,
  recordSkillEvidence,
  updateWorkload,
  updateAvailability,
  deleteExpertiseProfile,
  countExpertiseProfiles,
};
