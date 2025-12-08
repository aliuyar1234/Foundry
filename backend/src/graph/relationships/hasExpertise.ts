/**
 * HAS_EXPERTISE Relationship
 * T038 - Implement HAS_EXPERTISE relationship builder
 *
 * Represents the relationship between a Person and their Skills/Expertise
 */

import neo4j, { Integer } from 'neo4j-driver';
import { runQuery, runWriteTransaction } from '../connection.js';

// =============================================================================
// Types
// =============================================================================

export interface HasExpertiseRelation {
  personId: string;
  personEmail: string;
  skillId: string;
  skillName: string;
  skillCategory: string;
  level: number; // 1-5
  confidence: number; // 0-1
  evidenceCount: number;
  lastDemonstrated?: Date;
  source: ExpertiseSource;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpertiseSource =
  | 'inferred' // Derived from activity patterns
  | 'self_reported' // User claimed expertise
  | 'verified' // Confirmed through assessment
  | 'certification' // From official certification
  | 'peer_endorsed' // Endorsed by colleagues
  | 'directory'; // From HR/directory system

export interface CreateExpertiseInput {
  personId: string;
  skillName: string;
  skillCategory?: string;
  level?: number;
  confidence?: number;
  source?: ExpertiseSource;
  organizationId: string;
}

export interface UpdateExpertiseInput {
  level?: number;
  confidence?: number;
  evidenceCount?: number;
  source?: ExpertiseSource;
}

export interface SkillSearchOptions {
  minLevel?: number;
  minConfidence?: number;
  source?: ExpertiseSource;
  limit?: number;
  includeUnavailable?: boolean;
}

// =============================================================================
// Create & Update Operations
// =============================================================================

/**
 * Create or update HAS_EXPERTISE relationship between Person and Skill
 */
export async function setExpertise(
  input: CreateExpertiseInput
): Promise<HasExpertiseRelation> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      // Ensure Person exists
      MATCH (p:Person {organizationId: $organizationId, id: $personId})

      // Create or match Skill node
      MERGE (s:Skill {name: $skillName})
      ON CREATE SET
        s.id = randomUUID(),
        s.category = $skillCategory,
        s.createdAt = datetime()
      ON MATCH SET
        s.category = COALESCE($skillCategory, s.category)

      // Create or update relationship
      MERGE (p)-[r:HAS_EXPERTISE]->(s)
      ON CREATE SET
        r.level = $level,
        r.confidence = $confidence,
        r.evidenceCount = 1,
        r.source = $source,
        r.organizationId = $organizationId,
        r.createdAt = datetime(),
        r.updatedAt = datetime(),
        r.lastDemonstrated = datetime()
      ON MATCH SET
        r.level = CASE WHEN $level > r.level THEN $level ELSE r.level END,
        r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END,
        r.source = COALESCE($source, r.source),
        r.updatedAt = datetime()

      RETURN p, s, r
    `;

    const result = await tx.run(query, {
      organizationId: input.organizationId,
      personId: input.personId,
      skillName: input.skillName,
      skillCategory: input.skillCategory || 'general',
      level: neo4j.int(input.level || 1),
      confidence: input.confidence || 0.5,
      source: input.source || 'inferred',
    });

    const record = result.records[0];
    if (!record) {
      throw new Error(`Person not found: ${input.personId}`);
    }

    return {
      person: record.get('p').properties,
      skill: record.get('s').properties,
      relation: record.get('r').properties,
    };
  });

  return mapToHasExpertiseRelation(result);
}

/**
 * Update expertise level/confidence for existing relationship
 */
export async function updateExpertise(
  organizationId: string,
  personId: string,
  skillName: string,
  updates: UpdateExpertiseInput
): Promise<HasExpertiseRelation | null> {
  const result = await runWriteTransaction(async (tx) => {
    const setClauses: string[] = ['r.updatedAt = datetime()'];
    const params: Record<string, unknown> = { organizationId, personId, skillName };

    if (updates.level !== undefined) {
      setClauses.push('r.level = $level');
      params.level = neo4j.int(updates.level);
    }
    if (updates.confidence !== undefined) {
      setClauses.push('r.confidence = $confidence');
      params.confidence = updates.confidence;
    }
    if (updates.evidenceCount !== undefined) {
      setClauses.push('r.evidenceCount = $evidenceCount');
      params.evidenceCount = neo4j.int(updates.evidenceCount);
    }
    if (updates.source !== undefined) {
      setClauses.push('r.source = $source');
      params.source = updates.source;
    }

    const query = `
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
            -[r:HAS_EXPERTISE]->(s:Skill {name: $skillName})
      SET ${setClauses.join(', ')}
      RETURN p, s, r
    `;

    const result = await tx.run(query, params);
    const record = result.records[0];
    if (!record) return null;

    return {
      person: record.get('p').properties,
      skill: record.get('s').properties,
      relation: record.get('r').properties,
    };
  });

  return result ? mapToHasExpertiseRelation(result) : null;
}

/**
 * Record evidence of skill usage (increments evidence count and updates confidence)
 */
export async function recordEvidence(
  organizationId: string,
  personId: string,
  skillName: string,
  skillCategory: string = 'general',
  confidenceBoost: number = 0.05
): Promise<HasExpertiseRelation> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      // Ensure Person exists
      MATCH (p:Person {organizationId: $organizationId, id: $personId})

      // Create or match Skill node
      MERGE (s:Skill {name: $skillName})
      ON CREATE SET
        s.id = randomUUID(),
        s.category = $skillCategory,
        s.createdAt = datetime()

      // Create or update relationship
      MERGE (p)-[r:HAS_EXPERTISE]->(s)
      ON CREATE SET
        r.level = 1,
        r.confidence = 0.5 + $boost,
        r.evidenceCount = 1,
        r.source = 'inferred',
        r.organizationId = $organizationId,
        r.createdAt = datetime(),
        r.updatedAt = datetime(),
        r.lastDemonstrated = datetime()
      ON MATCH SET
        r.evidenceCount = r.evidenceCount + 1,
        r.confidence = CASE
          WHEN r.confidence + $boost > 1.0 THEN 1.0
          ELSE r.confidence + $boost
        END,
        r.level = CASE
          WHEN r.evidenceCount + 1 > 50 THEN 5
          WHEN r.evidenceCount + 1 > 30 THEN 4
          WHEN r.evidenceCount + 1 > 15 THEN 3
          WHEN r.evidenceCount + 1 > 5 THEN 2
          ELSE r.level
        END,
        r.lastDemonstrated = datetime(),
        r.updatedAt = datetime()

      RETURN p, s, r
    `;

    const result = await tx.run(query, {
      organizationId,
      personId,
      skillName,
      skillCategory,
      boost: confidenceBoost,
    });

    const record = result.records[0];
    if (!record) {
      throw new Error(`Person not found: ${personId}`);
    }

    return {
      person: record.get('p').properties,
      skill: record.get('s').properties,
      relation: record.get('r').properties,
    };
  });

  return mapToHasExpertiseRelation(result);
}

/**
 * Bulk create expertise relationships
 */
export async function bulkSetExpertise(
  inputs: CreateExpertiseInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $items as item
      MATCH (p:Person {organizationId: item.organizationId, id: item.personId})
      MERGE (s:Skill {name: item.skillName})
      ON CREATE SET
        s.id = randomUUID(),
        s.category = item.skillCategory,
        s.createdAt = datetime()
      MERGE (p)-[r:HAS_EXPERTISE]->(s)
      ON CREATE SET
        r.level = item.level,
        r.confidence = item.confidence,
        r.evidenceCount = 1,
        r.source = item.source,
        r.organizationId = item.organizationId,
        r.createdAt = datetime(),
        r.updatedAt = datetime(),
        r.lastDemonstrated = datetime()
      RETURN count(r) as count
    `;

    const items = inputs.map((input) => ({
      organizationId: input.organizationId,
      personId: input.personId,
      skillName: input.skillName,
      skillCategory: input.skillCategory || 'general',
      level: input.level || 1,
      confidence: input.confidence || 0.5,
      source: input.source || 'inferred',
    }));

    const result = await tx.run(query, { items });
    return toNumber(result.records[0]?.get('count'));
  });

  return result;
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get all expertise for a person
 */
export async function getPersonExpertise(
  organizationId: string,
  personId: string
): Promise<HasExpertiseRelation[]> {
  const results = await runQuery<{
    p: { properties: Record<string, unknown> };
    s: { properties: Record<string, unknown> };
    r: { properties: Record<string, unknown> };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId, id: $personId})
          -[r:HAS_EXPERTISE]->(s:Skill)
    RETURN p, s, r
    ORDER BY r.level DESC, r.confidence DESC
    `,
    { organizationId, personId }
  );

  return results.map((record) =>
    mapToHasExpertiseRelation({
      person: record.p.properties,
      skill: record.s.properties,
      relation: record.r.properties,
    })
  );
}

/**
 * Find experts for a specific skill
 */
export async function findExpertsBySkill(
  organizationId: string,
  skillName: string,
  options: SkillSearchOptions = {}
): Promise<Array<HasExpertiseRelation & { workload?: number }>> {
  const { minLevel = 1, minConfidence = 0, limit = 50 } = options;

  let availabilityFilter = '';
  if (!options.includeUnavailable) {
    availabilityFilter = 'AND (p.currentWorkload IS NULL OR p.currentWorkload < 80)';
  }

  let sourceFilter = '';
  if (options.source) {
    sourceFilter = 'AND r.source = $source';
  }

  const results = await runQuery<{
    p: { properties: Record<string, unknown> };
    s: { properties: Record<string, unknown> };
    r: { properties: Record<string, unknown> };
    workload: number | Integer | null;
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
          -[r:HAS_EXPERTISE]->(s:Skill)
    WHERE s.name =~ $skillPattern
      AND r.level >= $minLevel
      AND r.confidence >= $minConfidence
      ${availabilityFilter}
      ${sourceFilter}
    RETURN p, s, r, p.currentWorkload as workload
    ORDER BY r.level DESC, r.confidence DESC, workload ASC
    LIMIT $limit
    `,
    {
      organizationId,
      skillPattern: `(?i).*${skillName}.*`,
      minLevel,
      minConfidence,
      limit,
      source: options.source,
    }
  );

  return results.map((record) => ({
    ...mapToHasExpertiseRelation({
      person: record.p.properties,
      skill: record.s.properties,
      relation: record.r.properties,
    }),
    workload: toNumber(record.workload),
  }));
}

/**
 * Find people with multiple matching skills
 */
export async function findExpertsWithSkills(
  organizationId: string,
  skillNames: string[],
  options: { minMatchRatio?: number; minLevel?: number; limit?: number } = {}
): Promise<
  Array<{
    personId: string;
    personEmail: string;
    matchedSkills: Array<{ skillName: string; level: number; confidence: number }>;
    matchRatio: number;
  }>
> {
  const { minMatchRatio = 0.5, minLevel = 2, limit = 20 } = options;
  const minMatches = Math.ceil(skillNames.length * minMatchRatio);

  const results = await runQuery<{
    personId: string;
    email: string;
    skills: Array<{ skillName: string; level: number; confidence: number }>;
    matchCount: { low: number } | number;
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    WHERE p.currentWorkload IS NULL OR p.currentWorkload < 80
    OPTIONAL MATCH (p)-[r:HAS_EXPERTISE]->(s:Skill)
    WHERE ANY(skill IN $skillNames WHERE s.name =~ ('(?i).*' + skill + '.*'))
      AND r.level >= $minLevel
    WITH p, collect({
      skillName: s.name,
      level: r.level,
      confidence: r.confidence
    }) as matchedSkills, count(s) as matchCount
    WHERE matchCount >= $minMatches
    RETURN p.id as personId, p.email as email, matchedSkills as skills, matchCount
    ORDER BY matchCount DESC
    LIMIT $limit
    `,
    {
      organizationId,
      skillNames,
      minLevel,
      minMatches,
      limit,
    }
  );

  return results.map((record) => ({
    personId: record.personId,
    personEmail: record.email,
    matchedSkills: record.skills,
    matchRatio: toNumber(record.matchCount) / skillNames.length,
  }));
}

/**
 * Get all skills in organization with expert count
 */
export async function getOrganizationSkills(
  organizationId: string,
  options?: { minExperts?: number; category?: string }
): Promise<
  Array<{
    skillName: string;
    skillCategory: string;
    expertCount: number;
    avgLevel: number;
    topExperts: Array<{ personId: string; email: string; level: number }>;
  }>
> {
  let categoryFilter = '';
  const params: Record<string, unknown> = { organizationId };

  if (options?.category) {
    categoryFilter = 'AND s.category = $category';
    params.category = options.category;
  }

  const minExperts = options?.minExperts || 1;
  params.minExperts = minExperts;

  const results = await runQuery<{
    skillName: string;
    skillCategory: string;
    expertCount: { low: number } | number;
    avgLevel: number;
    topExperts: Array<{ personId: string; email: string; level: number }>;
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})-[r:HAS_EXPERTISE]->(s:Skill)
    ${categoryFilter}
    WITH s, collect({
      personId: p.id,
      email: p.email,
      level: r.level,
      confidence: r.confidence
    }) as experts
    WHERE size(experts) >= $minExperts
    RETURN s.name as skillName,
           s.category as skillCategory,
           size(experts) as expertCount,
           avg([e IN experts | e.level]) as avgLevel,
           [e IN experts | {personId: e.personId, email: e.email, level: e.level}][0..3] as topExperts
    ORDER BY expertCount DESC
    `,
    params
  );

  return results.map((record) => ({
    skillName: record.skillName,
    skillCategory: record.skillCategory || 'general',
    expertCount: toNumber(record.expertCount),
    avgLevel: record.avgLevel,
    topExperts: record.topExperts,
  }));
}

/**
 * Find skill gaps in team
 */
export async function findTeamSkillGaps(
  organizationId: string,
  teamMembers: string[],
  requiredSkills: string[]
): Promise<
  Array<{
    skillName: string;
    coverage: number;
    experts: Array<{ personId: string; level: number }>;
    gap: boolean;
  }>
> {
  const results = await runQuery<{
    skillName: string;
    experts: Array<{ personId: string; level: number }>;
    coverage: number;
  }>(
    `
    UNWIND $requiredSkills as skillName
    OPTIONAL MATCH (p:Person {organizationId: $organizationId})
                   -[r:HAS_EXPERTISE]->(s:Skill)
    WHERE p.id IN $teamMembers
      AND s.name =~ ('(?i).*' + skillName + '.*')
      AND r.level >= 2
    WITH skillName, collect({personId: p.id, level: r.level}) as experts
    RETURN skillName,
           experts,
           CASE WHEN size(experts) = 0 THEN 0.0
                ELSE toFloat(size(experts)) / toFloat($teamSize)
           END as coverage
    `,
    {
      organizationId,
      teamMembers,
      requiredSkills,
      teamSize: teamMembers.length,
    }
  );

  return results.map((record) => ({
    skillName: record.skillName,
    coverage: record.coverage,
    experts: record.experts.filter((e) => e.personId),
    gap: record.coverage < 0.2, // Less than 20% coverage is a gap
  }));
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Remove expertise relationship
 */
export async function removeExpertise(
  organizationId: string,
  personId: string,
  skillName: string
): Promise<boolean> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
            -[r:HAS_EXPERTISE]->(s:Skill {name: $skillName})
      DELETE r
      RETURN count(r) as deleted
    `;

    const result = await tx.run(query, { organizationId, personId, skillName });
    return toNumber(result.records[0]?.get('deleted'));
  });

  return result > 0;
}

/**
 * Remove all expertise for a person
 */
export async function removeAllPersonExpertise(
  organizationId: string,
  personId: string
): Promise<number> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (p:Person {organizationId: $organizationId, id: $personId})
            -[r:HAS_EXPERTISE]->(:Skill)
      DELETE r
      RETURN count(r) as deleted
    `;

    const result = await tx.run(query, { organizationId, personId });
    return toNumber(result.records[0]?.get('deleted'));
  });

  return result;
}

// =============================================================================
// Helper Functions
// =============================================================================

interface ExpertiseRecord {
  person: Record<string, unknown>;
  skill: Record<string, unknown>;
  relation: Record<string, unknown>;
}

function mapToHasExpertiseRelation(record: ExpertiseRecord): HasExpertiseRelation {
  const { person, skill, relation } = record;

  return {
    personId: person.id as string,
    personEmail: person.email as string,
    skillId: skill.id as string,
    skillName: skill.name as string,
    skillCategory: (skill.category as string) || 'general',
    level: toNumber(relation.level),
    confidence: (relation.confidence as number) || 0,
    evidenceCount: toNumber(relation.evidenceCount),
    lastDemonstrated: relation.lastDemonstrated
      ? new Date(relation.lastDemonstrated as string)
      : undefined,
    source: (relation.source as ExpertiseSource) || 'inferred',
    organizationId: (relation.organizationId as string) || (person.organizationId as string),
    createdAt: new Date(relation.createdAt as string),
    updatedAt: new Date(relation.updatedAt as string),
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
  setExpertise,
  updateExpertise,
  recordEvidence,
  bulkSetExpertise,
  getPersonExpertise,
  findExpertsBySkill,
  findExpertsWithSkills,
  getOrganizationSkills,
  findTeamSkillGaps,
  removeExpertise,
  removeAllPersonExpertise,
};
