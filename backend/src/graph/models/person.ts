/**
 * Person Node Model
 * Handles Person node operations in Neo4j knowledge graph
 */

import { runQuery, runWriteTransaction } from '../connection.js';

export interface PersonNode {
  id: string;
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  organizationId: string;
  externalId?: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePersonInput {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  organizationId: string;
  externalId?: string;
  source: string;
}

export interface PersonWithMetrics extends PersonNode {
  communicationCount?: number;
  meetingCount?: number;
  centralityScore?: number;
}

/**
 * Create or update a Person node
 */
export async function upsertPerson(input: CreatePersonInput): Promise<PersonNode> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MERGE (p:Person {organizationId: $organizationId, email: $email})
      ON CREATE SET
        p.id = randomUUID(),
        p.displayName = $displayName,
        p.department = $department,
        p.jobTitle = $jobTitle,
        p.externalId = $externalId,
        p.source = $source,
        p.createdAt = datetime(),
        p.updatedAt = datetime()
      ON MATCH SET
        p.displayName = COALESCE($displayName, p.displayName),
        p.department = COALESCE($department, p.department),
        p.jobTitle = COALESCE($jobTitle, p.jobTitle),
        p.externalId = COALESCE($externalId, p.externalId),
        p.updatedAt = datetime()
      RETURN p
    `;

    const result = await tx.run(query, {
      email: input.email.toLowerCase(),
      displayName: input.displayName || null,
      department: input.department || null,
      jobTitle: input.jobTitle || null,
      organizationId: input.organizationId,
      externalId: input.externalId || null,
      source: input.source,
    });

    return result.records[0]?.get('p').properties;
  });

  return mapToPersonNode(result);
}

/**
 * Bulk upsert persons
 */
export async function bulkUpsertPersons(
  inputs: CreatePersonInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $persons as person
      MERGE (p:Person {organizationId: person.organizationId, email: person.email})
      ON CREATE SET
        p.id = randomUUID(),
        p.displayName = person.displayName,
        p.department = person.department,
        p.jobTitle = person.jobTitle,
        p.externalId = person.externalId,
        p.source = person.source,
        p.createdAt = datetime(),
        p.updatedAt = datetime()
      ON MATCH SET
        p.displayName = COALESCE(person.displayName, p.displayName),
        p.department = COALESCE(person.department, p.department),
        p.jobTitle = COALESCE(person.jobTitle, p.jobTitle),
        p.updatedAt = datetime()
      RETURN count(p) as count
    `;

    const persons = inputs.map(input => ({
      email: input.email.toLowerCase(),
      displayName: input.displayName || null,
      department: input.department || null,
      jobTitle: input.jobTitle || null,
      organizationId: input.organizationId,
      externalId: input.externalId || null,
      source: input.source,
    }));

    const result = await tx.run(query, { persons });
    return result.records[0]?.get('count').toNumber() || 0;
  });

  return result;
}

/**
 * Find a person by email
 */
export async function findPersonByEmail(
  organizationId: string,
  email: string
): Promise<PersonNode | null> {
  const results = await runQuery<{ p: { properties: Record<string, unknown> } }>(
    `
    MATCH (p:Person {organizationId: $organizationId, email: $email})
    RETURN p
    `,
    { organizationId, email: email.toLowerCase() }
  );

  if (results.length === 0) return null;
  return mapToPersonNode(results[0].p.properties);
}

/**
 * Find persons by organization
 */
export async function findPersonsByOrganization(
  organizationId: string,
  options?: { limit?: number; offset?: number }
): Promise<PersonNode[]> {
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const results = await runQuery<{ p: { properties: Record<string, unknown> } }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN p
    ORDER BY p.displayName, p.email
    SKIP $offset LIMIT $limit
    `,
    { organizationId, limit, offset }
  );

  return results.map(r => mapToPersonNode(r.p.properties));
}

/**
 * Find persons with communication metrics
 */
export async function findPersonsWithMetrics(
  organizationId: string,
  options?: { limit?: number }
): Promise<PersonWithMetrics[]> {
  const limit = options?.limit || 50;

  const results = await runQuery<{
    p: { properties: Record<string, unknown> };
    commCount: { low: number };
    meetingCount: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[c:COMMUNICATES_WITH]-()
    OPTIONAL MATCH (p)-[m:ATTENDS]->(:Meeting)
    WITH p, count(DISTINCT c) as commCount, count(DISTINCT m) as meetingCount
    RETURN p, commCount, meetingCount
    ORDER BY commCount DESC
    LIMIT $limit
    `,
    { organizationId, limit }
  );

  return results.map(r => ({
    ...mapToPersonNode(r.p.properties),
    communicationCount: r.commCount?.low || 0,
    meetingCount: r.meetingCount?.low || 0,
  }));
}

/**
 * Search persons by name or email
 */
export async function searchPersons(
  organizationId: string,
  searchTerm: string,
  limit = 20
): Promise<PersonNode[]> {
  const results = await runQuery<{ p: { properties: Record<string, unknown> } }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    WHERE p.email CONTAINS $search OR p.displayName CONTAINS $search
    RETURN p
    ORDER BY p.displayName, p.email
    LIMIT $limit
    `,
    { organizationId, search: searchTerm.toLowerCase(), limit }
  );

  return results.map(r => mapToPersonNode(r.p.properties));
}

/**
 * Delete a person node
 */
export async function deletePerson(
  organizationId: string,
  email: string
): Promise<boolean> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (p:Person {organizationId: $organizationId, email: $email})
      DETACH DELETE p
      RETURN count(p) as deleted
    `;

    const result = await tx.run(query, {
      organizationId,
      email: email.toLowerCase(),
    });
    return result.records[0]?.get('deleted').toNumber() || 0;
  });

  return result > 0;
}

/**
 * Count persons in organization
 */
export async function countPersons(organizationId: string): Promise<number> {
  const results = await runQuery<{ count: { low: number } }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN count(p) as count
    `,
    { organizationId }
  );

  return results[0]?.count?.low || 0;
}

/**
 * Map Neo4j record to PersonNode
 */
function mapToPersonNode(properties: Record<string, unknown>): PersonNode {
  return {
    id: properties.id as string,
    email: properties.email as string,
    displayName: properties.displayName as string | undefined,
    department: properties.department as string | undefined,
    jobTitle: properties.jobTitle as string | undefined,
    organizationId: properties.organizationId as string,
    externalId: properties.externalId as string | undefined,
    source: properties.source as string,
    createdAt: new Date(properties.createdAt as string),
    updatedAt: new Date(properties.updatedAt as string),
  };
}
